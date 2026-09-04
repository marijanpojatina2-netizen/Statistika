"""Detekcija crvene mreže (10 cm raster) i ispravljanje fotografije u cm koordinatni sustav.

Koraci:
  1. "redness" karta  = R - (G+B)/2, zatim morfološki top-hat da ostanu samo tanke linije
  2. Houghove dužine -> grupiranje u linije -> dvije obitelji (x = const, y = const)
  3. indeksiranje linija (10 cm korak) relativno na ručno zadani približni ishodište-piksel
  4. početna homografija (RANSAC) iz svih presjecišta linija
  5. dorada: u ispravljenoj slici oko svakog očekivanog presjecišta sub-pikselno se traži
     vrh crvene linije po oba smjera -> precizna presjecišta
  6. konačno preslikavanje cm -> piksel: thin-plate-spline (RBF) preko svih presjecišta,
     što uz perspektivu popravlja i distorziju leće / neravnost papira
"""
from __future__ import annotations

import dataclasses
import logging
import math

import cv2
import numpy as np
from scipy.interpolate import RBFInterpolator

GRID_CM = 10.0  # razmak crvenih linija na papiru
log = logging.getLogger("jastuk_cv")


@dataclasses.dataclass
class GridResult:
    H: np.ndarray                 # homografija cm -> px (3x3)
    nodes_cm: np.ndarray          # (N,2) cm
    nodes_px: np.ndarray          # (N,2) px (precizno detektirano)
    rbf: RBFInterpolator          # cm -> px
    resid_h_px: float             # RMS ostatak homografije na preciznim čvorovima
    coarse_lines: dict            # za kontrolne slike
    x_range: tuple                # (xmin, xmax) cm koje pokriva mreža
    y_range: tuple

    def cm_to_px(self, pts_cm: np.ndarray) -> np.ndarray:
        return self.rbf(np.asarray(pts_cm, float).reshape(-1, 2))


# --------------------------------------------------------------------------- pomoćno
def redness(img_bgr: np.ndarray) -> np.ndarray:
    f = img_bgr.astype(np.float32)
    return f[..., 2] - 0.5 * (f[..., 1] + f[..., 0])


def ridge(red: np.ndarray, vertical: bool, width: int = 15, length: int = 41) -> np.ndarray:
    """Top-hat okomito na liniju (uklanja široke mrlje), zatim usrednjavanje duž linije."""
    k_th = np.ones((1, width), np.uint8) if vertical else np.ones((width, 1), np.uint8)
    th = cv2.morphologyEx(red, cv2.MORPH_TOPHAT, k_th)
    k_sm = np.ones((length, 1), np.float32) / length if vertical else np.ones((1, length), np.float32) / length
    return cv2.filter2D(th, -1, k_sm)


def _line_from_points(pts: np.ndarray, w: np.ndarray | None = None):
    """Vraća (p0, d) - točka i jedinični smjer, ponderirani PCA fit."""
    pts = np.asarray(pts, float)
    if w is None:
        w = np.ones(len(pts))
    c = (pts * w[:, None]).sum(0) / w.sum()
    q = (pts - c) * np.sqrt(w)[:, None]
    _, _, vt = np.linalg.svd(q, full_matrices=False)
    return c, vt[0]


def _intersect(l1, l2):
    (p1, d1), (p2, d2) = l1, l2
    A = np.array([d1, -d2]).T
    if abs(np.linalg.det(A)) < 1e-9:
        return None
    t = np.linalg.solve(A, p2 - p1)
    return p1 + t[0] * d1


def detect_family(red: np.ndarray, vertical: bool, min_total_len: float = 350.0, tol_px: float = 14.0):
    """Houghove dužine iz ridge-mape -> grupirane linije [(p0, d, total_len), ...]."""
    h, w = red.shape
    rm = ridge(red, vertical)
    mask = (rm > 4.0).astype(np.uint8) * 255
    segs = cv2.HoughLinesP(mask, 1, np.pi / 720, threshold=120, minLineLength=200, maxLineGap=30)
    if segs is None:
        return []
    segs = np.asarray(segs).reshape(-1, 4).astype(float)
    items = []
    for x1, y1, x2, y2 in segs:
        d = np.array([x2 - x1, y2 - y1])
        L = np.hypot(*d)
        if L < 1e-6:
            continue
        d /= L
        ang = math.degrees(math.atan2(d[1], d[0])) % 180
        if vertical and not (60 < ang < 120):
            continue
        if not vertical and not (ang < 30 or ang > 150):
            continue
        # koordinata na središnjoj liniji slike
        if vertical:
            t = (h / 2 - y1) / d[1]
            key = x1 + t * d[0]
        else:
            t = (w / 2 - x1) / d[0]
            key = y1 + t * d[1]
        items.append((key, L, (x1, y1), (x2, y2)))
    items.sort(key=lambda it: it[0])
    # grupiranje po ključu
    clusters, cur = [], []
    for it in items:
        if cur and it[0] - cur[-1][0] > tol_px:
            clusters.append(cur)
            cur = []
        cur.append(it)
    if cur:
        clusters.append(cur)
    lines = []
    for cl in clusters:
        total = sum(it[1] for it in cl)
        if total < min_total_len:
            continue
        pts = np.array([p for it in cl for p in (it[2], it[3])])
        wts = np.array([it[1] for it in cl for _ in range(2)])
        p0, d = _line_from_points(pts, wts)
        lines.append((p0, d, total))
    return lines


def index_lines(lines, origin_px, normal, spacing_px, max_missing=3):
    """Dodjeljuje cijeli indeks k (linija = k*10 cm) linijama mreže.

    Hoda se od linije najbliže ishodištu prema van; za svaki sljedeći korak očekuje se
    linija na udaljenosti ~spacing (lokalno prilagođeno zbog perspektive) i uzima se
    ona najbliža očekivanom položaju. Linije koje ne sjedaju u raster (rubovi papira,
    rukom nacrtane crvene linije, tekst) se preskaču."""
    origin_px = np.asarray(origin_px, float)
    normal = np.asarray(normal, float)
    normal /= np.linalg.norm(normal)
    # samo linije čiji je smjer blizu medijana obitelji (odbacuje kose poteze)
    dirs = np.array([d if np.dot(d, lines[0][1]) >= 0 else -d for _, d, _ in lines])
    med = dirs.mean(0)
    med /= np.linalg.norm(med)
    keep = [i for i, d in enumerate(dirs) if abs(np.dot(d, med)) > math.cos(math.radians(6))]
    lines = [lines[i] for i in keep]
    offs = []
    for p0, d, total in lines:
        n_line = np.array([-d[1], d[0]])
        if np.dot(n_line, normal) < 0:
            n_line = -n_line
        offs.append(np.dot(p0 - origin_px, n_line))
    offs = np.asarray(offs)
    i0 = int(np.argmin(np.abs(offs)))
    if abs(offs[i0]) > 0.35 * spacing_px:
        raise RuntimeError("nema linije mreže blizu zadanog ishodišta (%.0f px)" % offs[i0])
    idx = {i0: 0}
    for direction in (1, -1):
        prev_off, prev_k, sp = offs[i0], 0, spacing_px
        missing = 0
        while missing <= max_missing:
            expected = prev_off + direction * sp
            if direction * (expected - offs.max() if direction > 0 else offs.min() - expected) > 0.3 * sp:
                break
            cand = [i for i in range(len(lines)) if i not in idx and abs(offs[i] - expected) < 0.3 * sp]
            if cand:
                i = min(cand, key=lambda i: abs(offs[i] - expected))
                k = prev_k + direction
                idx[i] = k
                if missing == 0:
                    sp = abs(offs[i] - prev_off)
                prev_off, prev_k, missing = offs[i], k, 0
            else:
                prev_off, prev_k, missing = expected, prev_k + direction, missing + 1
    return [(lines[i][0], lines[i][1], lines[i][2], k) for i, k in sorted(idx.items(), key=lambda kv: kv[1])]


def family_spacing_px(lines) -> float | None:
    """Tipični razmak (px) susjednih linija jedne obitelji: medijan razlika okomitih udaljenosti
    od zajedničkog pravca. Kratke i kose linije su već odbačene u detect_family; rubovi papira i
    ručne linije eventualno daju jedan-dva 'kriva' razmaka koje medijan preživi."""
    if len(lines) < 3:
        return None
    dirs = np.array([d if np.dot(d, lines[0][1]) >= 0 else -d for _, d, _ in lines])
    med = dirs.mean(0)
    med /= np.linalg.norm(med)
    n = np.array([-med[1], med[0]])
    offs = np.sort(np.array([np.dot(p0, n) for p0, _, _ in lines]))
    d = np.diff(offs)
    d = d[d > 0.25 * np.median(d)]
    return float(np.median(d)) if len(d) else None


def estimate_px_per_cm(img_bgr: np.ndarray) -> float:
    """Približna gustoća piksela (px/cm) iz razmaka detektiranih linija mreže, bez ručnog ulaza.
    Dovoljno točno za indeksiranje linija (index_lines se lokalno prilagođava perspektivi)."""
    red = redness(img_bgr)
    sp = [family_spacing_px(detect_family(red, vertical=v)) for v in (True, False)]
    sp = [x for x in sp if x]
    if not sp:
        raise RuntimeError("mreža nije detektirana (nema dovoljno crvenih linija)")
    return float(np.mean(sp)) / GRID_CM


def detect_grid(img_bgr: np.ndarray, origin_px, xdir, ydir, px_per_cm: float | None = None, verbose=True,
                min_total_len: float = 350.0) -> GridResult:
    """min_total_len: najmanja ukupna duljina (px) crvene linije da uđe u obitelj; niže (npr. 200) kad
    folija prekriva gotovo cijelu širinu papira pa su linije ispod nje slabe."""
    red = redness(img_bgr)
    if px_per_cm is None:
        px_per_cm = estimate_px_per_cm(img_bgr)
        log.info("  procijenjeno px/cm: %.2f", px_per_cm)
    xdir = np.asarray(xdir, float)
    ydir = np.asarray(ydir, float)
    fam_v = detect_family(red, vertical=True, min_total_len=min_total_len)
    fam_h = detect_family(red, vertical=False, min_total_len=min_total_len)
    # obitelj čije su linije paralelne s ydir su linije x = const
    if abs(ydir[1]) > abs(ydir[0]):
        x_lines_raw, y_lines_raw = fam_v, fam_h
    else:
        x_lines_raw, y_lines_raw = fam_h, fam_v
    sp = GRID_CM * px_per_cm
    x_lines = index_lines(x_lines_raw, origin_px, xdir, sp)   # k -> x = 10k
    y_lines = index_lines(y_lines_raw, origin_px, ydir, sp)   # k -> y = 10k
    log.info("  linije x=const: k = %s", [l[3] for l in x_lines])
    log.info("  linije y=const: k = %s", [l[3] for l in y_lines])

    cm, px = [], []
    for p0x, dx_, _, kx in x_lines:
        for p0y, dy_, _, ky in y_lines:
            p = _intersect((p0x, dx_), (p0y, dy_))
            if p is None:
                continue
            cm.append((kx * GRID_CM, ky * GRID_CM))
            px.append(p)
    cm = np.array(cm, float)
    px = np.array(px, float)
    H, inl = cv2.findHomography(cm, px, cv2.RANSAC, 6.0)
    inl = inl.ravel().astype(bool)
    log.info("  gruba homografija: %d/%d inlier presjecišta", inl.sum(), len(inl))

    # ------------------------------------------------------------- dorada čvorova
    R = 10.0  # px/cm u pomoćnoj ispravljenoj slici
    xs = sorted(set(cm[inl, 0]))
    ys = sorted(set(cm[inl, 1]))
    x0, x1 = min(xs) - 5, max(xs) + 5
    y0, y1 = min(ys) - 5, max(ys) + 5
    W, Hh = int((x1 - x0) * R), int((y1 - y0) * R)
    # cm -> pomoćni px:  u = (x-x0)*R, v = (y1-y)*R
    A = np.array([[R, 0, -x0 * R], [0, -R, y1 * R], [0, 0, 1]])
    Hw = H @ np.linalg.inv(A)          # pomoćni px -> px slike
    warped = cv2.warpPerspective(img_bgr, Hw, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    wred = redness(warped)
    rv = ridge(wred, vertical=True, width=11, length=31)
    rh = ridge(wred, vertical=False, width=11, length=31)
    # rezerva: tamna (crna) tanka linija - osi su često precrtane crnim flomasterom preko crvene
    dark = 255.0 - cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY).astype(np.float32)
    dv = ridge(dark, vertical=True, width=11, length=31)
    dh = ridge(dark, vertical=False, width=11, length=31)
    n_dark = 0
    win = int(2.5 * R)
    nodes_cm, nodes_px = [], []
    for gx in xs:
        for gy in ys:
            u = (gx - x0) * R
            v = (y1 - gy) * R
            ui, vi = int(round(u)), int(round(v))
            if ui - win < 0 or vi - win < 0 or ui + win >= W or vi + win >= Hh:
                continue
            # profil po stupcima (okomita linija) u prozoru, bez samih redaka gdje je vodoravna linija
            colp = rv[vi - win:vi + win, ui - win:ui + win].mean(0)
            rowp = rh[vi - win:vi + win, ui - win:ui + win].mean(1)
            pu = _peak(colp, win, search=int(1.2 * R))
            pv = _peak(rowp, win, search=int(1.2 * R))
            if pu is None:
                pu = _peak(dv[vi - win:vi + win, ui - win:ui + win].mean(0), win, search=int(0.8 * R), min_val=15.0)
                n_dark += pu is not None
            if pv is None:
                pv = _peak(dh[vi - win:vi + win, ui - win:ui + win].mean(1), win, search=int(0.8 * R), min_val=15.0)
                n_dark += pv is not None
            if pu is None or pv is None:
                continue
            uu, vv = ui - win + pu, vi - win + pv
            p = Hw @ np.array([uu, vv, 1.0])
            nodes_cm.append((gx, gy))
            nodes_px.append(p[:2] / p[2])
    nodes_cm = np.array(nodes_cm)
    nodes_px = np.array(nodes_px)
    inl2 = _robust_poly_inliers(nodes_cm, nodes_px, thresh=3.0)
    nodes_cm, nodes_px = nodes_cm[inl2], nodes_px[inl2]
    H2, _ = cv2.findHomography(nodes_cm, nodes_px, 0)
    proj = cv2.perspectiveTransform(nodes_cm.reshape(-1, 1, 2), H2).reshape(-1, 2)
    resid = np.sqrt(((proj - nodes_px) ** 2).sum(1))
    log.info("  precizni čvorovi: %d (odbačeno %d, %d koord. iz crne linije), ostatak homografije RMS=%.2f px, max=%.2f px",
             len(nodes_cm), (~inl2).sum(), n_dark, np.sqrt((resid ** 2).mean()), resid.max())
    rbf = RBFInterpolator(nodes_cm, nodes_px, kernel="thin_plate_spline", degree=1, smoothing=1.0)
    rp = rbf(nodes_cm)
    r2 = np.sqrt(((rp - nodes_px) ** 2).sum(1))
    log.info("  TPS ostatak RMS=%.2f px, max=%.2f px", np.sqrt((r2 ** 2).mean()), r2.max())
    return GridResult(H=H2, nodes_cm=nodes_cm, nodes_px=nodes_px, rbf=rbf,
                      resid_h_px=float(np.sqrt((resid ** 2).mean())),
                      coarse_lines={"x": x_lines, "y": y_lines},
                      x_range=(min(xs), max(xs)), y_range=(min(ys), max(ys)))


def _robust_poly_inliers(cm: np.ndarray, px: np.ndarray, thresh: float, degree: int = 3):
    """Kubični polinom cm->px (glatko: perspektiva + distorzija) uz iterativno odbacivanje
    krivo detektiranih čvorova (tekst, nabori folije...)."""
    def design(p):
        x, y = p[:, 0] / 100.0, p[:, 1] / 100.0
        cols = [np.ones_like(x)]
        for dgr in range(1, degree + 1):
            for i in range(dgr + 1):
                cols.append(x ** (dgr - i) * y ** i)
        return np.stack(cols, 1)
    A = design(cm)
    keep = np.ones(len(cm), bool)
    for _ in range(10):
        coef, *_ = np.linalg.lstsq(A[keep], px[keep], rcond=None)
        r = np.sqrt(((A @ coef - px) ** 2).sum(1))
        new = r < thresh
        if new.sum() < 12 or np.array_equal(new, keep):
            break
        keep = new
    return keep


def _peak(profile: np.ndarray, center: int, search: int, min_val: float = 2.0):
    seg = profile[center - search:center + search + 1]
    i = int(np.argmax(seg))
    base = np.median(profile)
    if seg[i] < min_val or seg[i] < base + 0.75 * min_val:
        return None
    if 0 < i < len(seg) - 1:
        a, b, c = seg[i - 1], seg[i], seg[i + 1]
        den = a - 2 * b + c
        off = 0.5 * (a - c) / den if abs(den) > 1e-9 else 0.0
    else:
        off = 0.0
    return center - search + i + off


def rectify(img_bgr: np.ndarray, grid: GridResult, x_range, y_range, R: float = 10.0):
    """Ispravljena slika: 1 px = 1/R cm.  u = (x - xmin)*R,  v = (ymax - y)*R  (y prema gore)."""
    xmin, xmax = x_range
    ymin, ymax = y_range
    W, Hh = int(round((xmax - xmin) * R)), int(round((ymax - ymin) * R))
    step = 4
    us = np.arange(0, W + step, step)
    vs = np.arange(0, Hh + step, step)
    U, V = np.meshgrid(us, vs)
    cmx = xmin + U / R
    cmy = ymax - V / R
    pts = np.stack([cmx.ravel(), cmy.ravel()], 1)
    src = grid.cm_to_px(pts).reshape(U.shape + (2,)).astype(np.float32)
    mapx = cv2.resize(src[..., 0], None, fx=step, fy=step, interpolation=cv2.INTER_LINEAR)[:Hh, :W]
    mapy = cv2.resize(src[..., 1], None, fx=step, fy=step, interpolation=cv2.INTER_LINEAR)[:Hh, :W]
    out = cv2.remap(img_bgr, mapx, mapy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    return out


def to_rect_px(pts_cm, x_range, y_range, R=10.0):
    pts_cm = np.asarray(pts_cm, float)
    return np.stack([(pts_cm[:, 0] - x_range[0]) * R, (y_range[1] - pts_cm[:, 1]) * R], 1)


def to_cm(pts_px, x_range, y_range, R=10.0):
    pts_px = np.asarray(pts_px, float)
    return np.stack([x_range[0] + pts_px[:, 0] / R, y_range[1] - pts_px[:, 1] / R], 1)
