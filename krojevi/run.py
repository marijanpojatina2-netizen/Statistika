"""Glavni tijek: fotografija -> mreža -> ispravljena slika -> kontura (mm) -> DXF/PDF.

Pokretanje iz korijena repozitorija:  python3 krojevi/run.py
Rezultati u  izlaz/  (DXF, PDF, kontrolne PNG slike, JSON s polilinijama u mm).
"""
from __future__ import annotations

import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from config import ELEMENTS                                   # noqa: E402
from grid import detect_grid, rectify, to_cm, to_rect_px      # noqa: E402
from contour import (extract_outline, resample_closed, smooth_closed, simplify_closed,  # noqa: E402
                     ensure_ccw, perimeter, find_corners)
import outputs                                                # noqa: E402

R = 10.0          # px/cm u ispravljenoj slici  (1 px = 1 mm)
MARGIN_CM = 3.0   # ispravljena slika: od -3 cm do zadnje linije mreže + 3 cm
OUT = "izlaz"
CTL = os.path.join(OUT, "kontrola")


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


def process(e: dict) -> dict:
    print(f"== {e['layer']}  ({e['file']})")
    img = cv2.imread(e["file"])
    g = detect_grid(img, e["origin_px"], e["xdir"], e["ydir"], e["px_per_cm"])
    xr = (-MARGIN_CM, g.x_range[1] + MARGIN_CM)
    yr = (-MARGIN_CM, g.y_range[1] + MARGIN_CM)
    rect = rectify(img, g, xr, yr, R)

    seed = to_rect_px(np.array([e["seed_cm"]], float), xr, yr, R)[0]
    poly_px, stroke_px, _ = extract_outline(rect, seed)
    poly_cm = to_cm(poly_px, xr, yr, R)
    poly_mm = poly_cm * 10.0
    # glatki polyline: uzorkovanje 1 mm -> Gauss (sigma 2 mm) -> pojednostavljenje 0.3 mm
    p = resample_closed(poly_mm, 1.0)
    p = smooth_closed(p, 2.0)
    p = simplify_closed(p, 0.3)
    p = ensure_ccw(p)
    if e.get("square_corner_cm"):
        p = square_corner(p, np.array(e["square_corner_cm"], float) * 10.0)
    # početak polilinije: točka najbliža ishodištu papira (donji lijevi kut); ako je to usred
    # ugla, početak se pomiče na početak tog ugla da se ugao ne "lomi" preko početka trake
    i0 = int(np.argmin(p[:, 0] + p[:, 1]))
    p = np.roll(p, -i0, axis=0)
    corners = find_corners(p)
    wrap = [c for c in corners if c["s_start"] > c["s_end"]]
    if wrap:
        d = np.hypot(*(p - np.asarray(wrap[0]["p_start"])).T)
        p = np.roll(p, -int(np.argmin(d)), axis=0)
        corners = find_corners(p)
    per = perimeter(p)
    bb_min, bb_max = p.min(0), p.max(0)
    stroke_med, stroke_max = float(np.median(stroke_px)), float(stroke_px.max())
    print(f"  kontura: {len(p)} točaka, opseg {per:.0f} mm, gabarit {bb_max[0]-bb_min[0]:.0f} x {bb_max[1]-bb_min[1]:.0f} mm,"
          f" debljina poteza medijan {stroke_med:.1f} mm / max {stroke_max:.1f} mm, uglova: {len(corners)}")
    for c in corners:
        print(f"    ugao: s={c['s_start']:.0f}..{c['s_end']:.0f} mm, zakret {c['turn_deg']:+.0f}°")

    # ---------------- kontrolne slike
    os.makedirs(CTL, exist_ok=True)
    vis = rect.copy()
    # mreža 10 cm (cijan) + 5 cm (tanko)
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
    for c, q in zip(g.nodes_cm, g.nodes_px):
        u, v = to_rect_px(c.reshape(1, 2), xr, yr, R)[0]
        cv2.circle(vis, (int(round(u)), int(round(v))), 6, (255, 0, 255), 1)
    pp = to_rect_px(p / 10.0, xr, yr, R).astype(np.int32)
    cv2.polylines(vis, [pp], True, (0, 255, 0), 2)
    for c in corners:
        for key, col in (("p_start", (0, 165, 255)), ("p_end", (0, 165, 255)), ("p_apex", (0, 0, 255))):
            u, v = to_rect_px(np.asarray(c[key]).reshape(1, 2) / 10.0, xr, yr, R)[0]
            cv2.circle(vis, (int(round(u)), int(round(v))), 7, col, 2)
    cv2.imwrite(os.path.join(CTL, f"{e['key']}_ispravljeno_kontura.png"), vis)

    # detekcija mreže na originalu
    det = img.copy()
    for fam, col in (("x", (0, 0, 255)), ("y", (0, 160, 0))):
        for p0, d, tot, k in g.coarse_lines[fam]:
            a = (p0 - d * 3000).astype(int)
            b = (p0 + d * 3000).astype(int)
            cv2.line(det, tuple(a), tuple(b), col, 1)
    for q in g.nodes_px:
        cv2.circle(det, tuple(q.astype(int)), 8, (255, 0, 0), 2)
    src = g.cm_to_px(p / 10.0).astype(np.int32)
    cv2.polylines(det, [src], True, (0, 255, 0), 2)
    cv2.imwrite(os.path.join(CTL, f"{e['key']}_detekcija_mreze.png"), det)

    return dict(key=e["key"], layer=e["layer"], file=e["file"], poly_mm=p, corners=corners,
                perimeter_mm=per, bbox_mm=(bb_min.tolist(), bb_max.tolist()), stroke_mm=stroke_med, stroke_max_mm=stroke_max,
                grid_nodes=len(g.nodes_cm), homography_rms_px=g.resid_h_px)


def main():
    os.makedirs(OUT, exist_ok=True)
    results = [process(e) for e in ELEMENTS]
    # JSON s polilinijama (mm) za daljnju obradu
    js = []
    for r in results:
        js.append(dict(layer=r["layer"], file=r["file"], perimeter_mm=round(r["perimeter_mm"], 1),
                       bbox_mm=r["bbox_mm"], stroke_mm=round(r["stroke_mm"], 2), stroke_max_mm=round(r["stroke_max_mm"], 2),
                       poly_mm=np.round(r["poly_mm"], 2).tolist(),
                       corners=[dict(s_start_mm=round(c["s_start"], 1), s_end_mm=round(c["s_end"], 1),
                                     s_apex_mm=round(c["s_apex"], 1), turn_deg=round(c["turn_deg"], 1))
                                for c in r["corners"]]))
    with open(os.path.join(OUT, "konture_mm.json"), "w", encoding="utf-8") as f:
        json.dump(js, f, ensure_ascii=False, indent=1)
    outputs.write_elements_1_1(results, os.path.join(OUT, "elementi_1_1"))
    outputs.write_strip_offset(results, os.path.join(OUT, "elementi_traka_offset"))
    print("gotovo ->", OUT)


if __name__ == "__main__":
    main()
