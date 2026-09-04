"""Mjerenje krojnog uzorka s fotografije folije na papiru s crvenom mrežom (metoda A).

Javni API:

    m = measure_grid(img, origin_px=(367, 1872), x_axis_px=(1200, 1872), seed_px=(700, 1100))
    m.poly_mm, m.perimeter_mm, m.bbox_mm, m.corners, m.quality()
    m.control_images(img)  ->  {"rectified": ..., "detection": ...}

Ulazi su ono što korisnik dodirne na fotografiji: ishodište mreže, jedna točka na osi x
(npr. oznaka "50") i jedna točka unutar uzorka. Gustoća piksela se procjenjuje sama ako
nije zadana. Sve ostalo (mreža, homografija, TPS, kontura) je automatsko.
"""
from __future__ import annotations

import dataclasses
import logging

import cv2
import numpy as np

from .grid import GridResult, detect_grid, rectify, to_cm, to_rect_px
from .contour import (extract_outline, resample_closed, smooth_closed, simplify_closed,
                      ensure_ccw, perimeter, find_corners)

log = logging.getLogger("jastuk_cv")

R = 10.0          # px/cm u ispravljenoj slici  (1 px = 1 mm)
MARGIN_CM = 3.0   # ispravljena slika: od -3 cm do zadnje linije mreže + 3 cm


# --------------------------------------------------------------------------- geometrija
def axes_from_points(origin_px, x_axis_px):
    """Smjerovi osi papira u slici iz dvije dodirnute točke: ishodište i točka na osi x.
    Os y je os x zakrenuta za 90° tako da papir gledan odozgo bude desni sustav (u slici je
    y prema dolje, pa je zakret (x, y) -> (y, -x))."""
    o = np.asarray(origin_px, float)
    a = np.asarray(x_axis_px, float)
    xdir = a - o
    n = np.linalg.norm(xdir)
    if n < 1e-6:
        raise ValueError("točka na osi x je jednaka ishodištu")
    xdir /= n
    ydir = np.array([xdir[1], -xdir[0]])
    return xdir, ydir


def square_corner(p: np.ndarray, corner_mm: np.ndarray, r_cut: float = 140.0, r_fit: float = 320.0) -> np.ndarray:
    """Ispravlja kut na oštrih 90° (napomena 'IZRAVNATI 90°' na uzorku): točke bliže od r_cut
    kutu se uklanjaju, kroz susjedne točke (r_cut..r_fit) sa svake strane provlači se pravac,
    a presjecište pravaca postaje vrh kuta."""
    d = np.hypot(*(p - corner_mm).T)
    inside = d < r_cut
    if not inside.any() or inside.all():
        return p
    # zatvorena polilinija: rotiraj tako da blok 'inside' bude na početku
    start = int(np.argmax(np.diff(inside.astype(int), prepend=inside[-1]) == 1))
    p = np.roll(p, -start, axis=0)
    inside = np.roll(inside, -start)
    m = int(np.argmin(inside))          # prvi indeks izvan kuta
    after = p[m:]                       # ostatak konture (obje strane kuta na krajevima)
    da = np.hypot(*(after - corner_mm).T)
    far = np.nonzero(da >= r_fit)[0]
    seg_a = after[:far[0]]                # strana koja slijedi iza kuta (do r_fit)
    seg_b = after[far[-1] + 1:]           # strana koja prethodi kutu
    if len(seg_a) < 2 or len(seg_b) < 2:
        return p

    def fit(q):
        c = q.mean(0)
        _, _, vt = np.linalg.svd(q - c)
        return c, vt[0]

    ca, va = fit(seg_a)
    cb, vb = fit(seg_b)
    t = np.linalg.solve(np.array([va, -vb]).T, cb - ca)
    x = ca + t[0] * va
    return np.vstack([x[None, :], after])


def finish_polyline(poly_mm: np.ndarray, square_corner_mm=None):
    """Od sirove konture (mm) do glatke polilinije s uglovima:
    uzorkovanje 1 mm -> Gauss (sigma 2 mm) -> Douglas-Peucker 0.3 mm -> CCW -> (kut na 90°)
    -> početak = točka najbliža ishodištu papira, ali nikad usred ugla."""
    p = resample_closed(poly_mm, 1.0)
    p = smooth_closed(p, 2.0)
    p = simplify_closed(p, 0.3)
    p = ensure_ccw(p)
    if square_corner_mm is not None:
        p = square_corner(p, np.asarray(square_corner_mm, float))
    i0 = int(np.argmin(p[:, 0] + p[:, 1]))
    p = np.roll(p, -i0, axis=0)
    corners = find_corners(p)
    wrap = [c for c in corners if c["s_start"] > c["s_end"]]
    if wrap:
        d = np.hypot(*(p - np.asarray(wrap[0]["p_start"])).T)
        p = np.roll(p, -int(np.argmin(d)), axis=0)
        corners = find_corners(p)
    return p, corners


# --------------------------------------------------------------------------- rezultat
@dataclasses.dataclass
class GridMeasurement:
    poly_mm: np.ndarray          # (N,2) zatvorena polilinija, CCW, koordinate papira u mm
    corners: list                # find_corners(...)
    perimeter_mm: float
    bbox_mm: tuple               # ((xmin, ymin), (xmax, ymax))
    stroke_mm: float             # medijan debljine poteza
    stroke_max_mm: float
    px_per_cm: float             # korištena (zadana ili procijenjena) gustoća piksela
    grid: GridResult
    x_range: tuple               # cm područje ispravljene slike
    y_range: tuple
    rect: np.ndarray             # ispravljena slika, 1 px = 1 mm

    @property
    def grid_nodes(self) -> int:
        return int(len(self.grid.nodes_cm))

    @property
    def homography_rms_px(self) -> float:
        return float(self.grid.resid_h_px)

    def quality(self) -> dict:
        """Brojke po kojima aplikacija odlučuje traži li ponovnu fotografiju."""
        return dict(grid_nodes=self.grid_nodes, homography_rms_px=round(self.homography_rms_px, 2),
                    stroke_mm=round(self.stroke_mm, 2), stroke_max_mm=round(self.stroke_max_mm, 2),
                    px_per_cm=round(self.px_per_cm, 2))

    def to_dict(self) -> dict:
        return dict(perimeter_mm=round(self.perimeter_mm, 1), bbox_mm=self.bbox_mm,
                    stroke_mm=round(self.stroke_mm, 2), stroke_max_mm=round(self.stroke_max_mm, 2),
                    poly_mm=np.round(self.poly_mm, 2).tolist(),
                    corners=[dict(s_start_mm=round(c["s_start"], 1), s_end_mm=round(c["s_end"], 1),
                                  s_apex_mm=round(c["s_apex"], 1), turn_deg=round(c["turn_deg"], 1))
                             for c in self.corners],
                    quality=self.quality())

    def as_result(self, key: str, layer: str, file: str = "") -> dict:
        """Zapis kakav očekuje outputs.write_* (DXF/PDF)."""
        return dict(key=key, layer=layer, file=file, poly_mm=self.poly_mm, corners=self.corners,
                    perimeter_mm=self.perimeter_mm, bbox_mm=self.bbox_mm, stroke_mm=self.stroke_mm,
                    stroke_max_mm=self.stroke_max_mm, grid_nodes=self.grid_nodes,
                    homography_rms_px=self.homography_rms_px)

    # ------------------------------------------------------------------ kontrolne slike
    def control_images(self, img_bgr: np.ndarray) -> dict:
        xr, yr, g, p = self.x_range, self.y_range, self.grid, self.poly_mm
        vis = self.rect.copy()
        for x in np.arange(0, xr[1], 5):
            u = int(round((x - xr[0]) * R))
            cv2.line(vis, (u, 0), (u, vis.shape[0]), (255, 255, 0) if x % 10 == 0 else (200, 200, 120), 1)
        for y in np.arange(0, yr[1], 5):
            v = int(round((yr[1] - y) * R))
            cv2.line(vis, (0, v), (vis.shape[1], v), (255, 255, 0) if y % 10 == 0 else (200, 200, 120), 1)
        for x in np.arange(0, xr[1], 10):
            cv2.putText(vis, f"{x:.0f}", (int((x - xr[0]) * R) + 3, vis.shape[0] - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 200, 0), 2)
        for y in np.arange(0, yr[1], 10):
            cv2.putText(vis, f"{y:.0f}", (4, int((yr[1] - y) * R) - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 200, 0), 2)
        for c in g.nodes_cm:
            u, v = to_rect_px(c.reshape(1, 2), xr, yr, R)[0]
            cv2.circle(vis, (int(round(u)), int(round(v))), 6, (255, 0, 255), 1)
        pp = to_rect_px(p / 10.0, xr, yr, R).astype(np.int32)
        cv2.polylines(vis, [pp], True, (0, 255, 0), 2)
        for c in self.corners:
            for key, col in (("p_start", (0, 165, 255)), ("p_end", (0, 165, 255)), ("p_apex", (0, 0, 255))):
                u, v = to_rect_px(np.asarray(c[key]).reshape(1, 2) / 10.0, xr, yr, R)[0]
                cv2.circle(vis, (int(round(u)), int(round(v))), 7, col, 2)

        det = img_bgr.copy()
        for fam, col in (("x", (0, 0, 255)), ("y", (0, 160, 0))):
            for p0, d, tot, k in g.coarse_lines[fam]:
                a = (p0 - d * 3000).astype(int)
                b = (p0 + d * 3000).astype(int)
                cv2.line(det, tuple(a), tuple(b), col, 1)
        for q in g.nodes_px:
            cv2.circle(det, tuple(q.astype(int)), 8, (255, 0, 0), 2)
        src = g.cm_to_px(p / 10.0).astype(np.int32)
        cv2.polylines(det, [src], True, (0, 255, 0), 2)
        return {"rectified": vis, "detection": det}


# --------------------------------------------------------------------------- glavni API
def measure_grid(img_bgr: np.ndarray, origin_px, *, xdir=None, ydir=None, x_axis_px=None,
                 px_per_cm: float | None = None, seed_cm=None, seed_px=None,
                 square_corner_cm=None) -> GridMeasurement:
    """Fotografija (BGR) -> izmjereni uzorak u mm.

    origin_px       piksel ishodišta mreže (0,0) na fotografiji
    x_axis_px       piksel neke točke na osi x papira (alternativa: xdir i ydir kao vektori)
    px_per_cm       približna gustoća; None = procjena iz mreže
    seed_cm/seed_px točka unutar uzorka, u cm papira ili kao piksel fotografije
    square_corner_cm  kut (cm) koji treba izravnati na 90°
    """
    if x_axis_px is not None:
        xdir, ydir = axes_from_points(origin_px, x_axis_px)
    if xdir is None or ydir is None:
        raise ValueError("zadaj x_axis_px ili xdir i ydir")
    g = detect_grid(img_bgr, origin_px, xdir, ydir, px_per_cm)
    if px_per_cm is None:
        px_per_cm = float(np.sqrt(abs(np.linalg.det(g.H[:2, :2]))))
    xr = (-MARGIN_CM, g.x_range[1] + MARGIN_CM)
    yr = (-MARGIN_CM, g.y_range[1] + MARGIN_CM)
    rect = rectify(img_bgr, g, xr, yr, R)

    if seed_cm is None:
        if seed_px is None:
            raise ValueError("zadaj seed_cm ili seed_px")
        Hinv = np.linalg.inv(g.H)
        seed_cm = cv2.perspectiveTransform(np.array([[seed_px]], np.float64), Hinv).reshape(2)
        log.info("  sjeme %s px -> (%.1f, %.1f) cm", tuple(seed_px), *seed_cm)
    seed = to_rect_px(np.array([seed_cm], float), xr, yr, R)[0]
    poly_px, stroke_px, _ = extract_outline(rect, seed)
    poly_mm = to_cm(poly_px, xr, yr, R) * 10.0
    sq = None if square_corner_cm is None else np.asarray(square_corner_cm, float) * 10.0
    p, corners = finish_polyline(poly_mm, sq)
    per = perimeter(p)
    bb_min, bb_max = p.min(0), p.max(0)
    m = GridMeasurement(poly_mm=p, corners=corners, perimeter_mm=per,
                        bbox_mm=(bb_min.tolist(), bb_max.tolist()),
                        stroke_mm=float(np.median(stroke_px)), stroke_max_mm=float(stroke_px.max()),
                        px_per_cm=float(px_per_cm), grid=g, x_range=xr, y_range=yr, rect=rect)
    log.info("  kontura: %d točaka, opseg %.0f mm, gabarit %.0f x %.0f mm, debljina poteza medijan %.1f mm / max %.1f mm, uglova: %d",
             len(p), per, bb_max[0] - bb_min[0], bb_max[1] - bb_min[1], m.stroke_mm, m.stroke_max_mm, len(corners))
    for c in corners:
        log.info("    ugao: s=%.0f..%.0f mm, zakret %+.0f°", c["s_start"], c["s_end"], c["turn_deg"])
    return m
