"""Zadatak: 13 fotografija folija na papiru s mrežom -> konture u mm, "ispeglane" (ravni dijelovi su
pravci, zaobljenja glatke krivulje), DXF 1:1 + PDF 1:10.

    python3 zadaci/krojevi_2026-09/run.py

Ulaz po fotografiji: približno ishodište mreže (px), točka na osi s rastućim brojevima (px), jedno ili
više sjemena unutar folije (px; dva kad dijagonalna linija dijeli foliju). Sve ostalo je automatsko.
"""
from __future__ import annotations

import json
import logging
import os
import sys

import cv2
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
from jastuk_cv.grid import detect_grid, rectify, to_cm, to_rect_px, redness, detect_family   # noqa: E402
from jastuk_cv.contour import (extract_outline, resample_closed, smooth_closed, simplify_closed,  # noqa: E402
                               ensure_ccw, perimeter, find_corners)
from jastuk_cv.measure import axes_from_points, square_corner, R, MARGIN_CM  # noqa: E402
from jastuk_cv import features as FT                                         # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "izlaz")
CTL = os.path.join(OUT, "kontrola")
log = logging.getLogger("jastuk_cv")

# približno ishodište, točka na osi (smjer rastućih brojeva), sjeme(na) u foliji, sve u px fotografije
ELEMENTS = [
    dict(file="01.jpg", layer="1B LICE DESNA",        origin=(200, 1865), axis=(900, 1865), seeds=[(700, 1000)]),
    dict(file="02.jpg", layer="1A PROVA DESNA",       origin=(1100, 1850), axis=(1100, 1000), seeds=[(700, 1000)]),
    dict(file="03.jpg", layer="2D NASLON VELIKI KRMA", origin=(400, 1885), axis=(1000, 1885), seeds=[(650, 1000)]),
    dict(file="04.jpg", layer="2E KRMA",              origin=(290, 1900), axis=(1000, 1900), seeds=[(800, 1100)]),
    dict(file="05.jpg", layer="1B LICE DESNA (2)",    origin=(125, 435), axis=(125, 1200), seeds=[(700, 1000)]),
    dict(file="06.jpg", layer="1C LICE",              origin=(140, 95), axis=(140, 900), seeds=[(700, 900)]),
    dict(file="07.jpg", layer="2B KRMA VELIKA KUPA STOLA", origin=(525, 1880), axis=(1000, 1880), seeds=[(700, 1000)]),
    dict(file="08.jpg", layer="KLUP LICE KRMA",       origin=(367, 1872), axis=(900, 1872), seeds=[(650, 1100)], square_corner_cm=(0, 0)),
    dict(file="09.jpg", layer="1A PROVA DESNA (2)",   origin=(435, 305), axis=(435, 1100), seeds=[(800, 1000)]),
    dict(file="10.jpg", layer="1F LICE",              origin=(215, 185), axis=(215, 1000), seeds=[(800, 1000)]),
    dict(file="11.jpg", layer="2C LICE PROVA",        origin=(100, 1890), axis=(1000, 1890), seeds_cm=[(15, 110), (55, 60)]),
    dict(file="12.jpg", layer="5C LICE PROVA",        origin=(160, 1895), axis=(1000, 1895), seeds_cm=[(60, 100), (20, 40)]),
    dict(file="13.jpg", layer="1E PROVA LIJEVA",      origin=(125, 1865), axis=(1000, 1865), seeds=[(700, 1000)], min_total_len=200),
]


# --------------------------------------------------------------------------- peglanje
def iron(p: np.ndarray, straight_tol: float = 15.0, sigma_curve: float = 8.0, sigma_corner: float = 5.0, min_len: float = 60.0) -> np.ndarray:
    """Zatvorena polilinija (mm, ~1 mm korak) -> "ispeglana": između uglova, dio čiji je najveći otklon
    od pravca kroz krajeve manji od straight_tol postaje pravac (TLS prilagodba, otklon flomastera
    nestaje); ostali dijelovi i sami uglovi se glade Gaussom (sigma_curve). Spojevi su neprekidni."""
    p = resample_closed(p, 1.0)
    n = len(p)
    corners = find_corners(p)
    if not corners:
        return smooth_closed(p, sigma_curve)
    # indeksi početka/kraja uglova
    def idx_of(pt):
        return int(np.argmin(np.hypot(*(p - np.asarray(pt)).T)))
    cuts = sorted(set([idx_of(c["p_start"]) for c in corners] + [idx_of(c["p_end"]) for c in corners]))
    # dijelovi između uzastopnih rezova (ciklički); označi koji su uglovi (unutar start..end nekog ugla)
    corner_spans = [(idx_of(c["p_start"]), idx_of(c["p_end"])) for c in corners]

    def in_corner(a, b):
        mid = (a + ((b - a) % n) / 2) % n
        for s, e in corner_spans:
            if s <= e:
                if s <= mid <= e:
                    return True
            elif mid >= s or mid <= e:
                return True
        return False

    out = np.zeros_like(p)
    fixed = np.zeros(n, bool)
    # 1) ravni dijelovi: zamijeni pravcem (projekcija točaka na TLS pravac)
    for a, b in zip(cuts, cuts[1:] + [cuts[0]]):
        idx = np.arange(a, a + ((b - a) % n) + 1) % n
        seg = p[idx]
        if in_corner(a, b) or len(seg) < min_len:
            continue
        c0 = seg.mean(0)
        _, _, vt = np.linalg.svd(seg - c0)
        d = vt[0]
        dev = np.abs((seg - c0) @ np.array([-d[1], d[0]]))
        if dev.max() > straight_tol:
            continue                                     # stvarno zakrivljen dio: ostaje krivulja
        t = (seg - c0) @ d
        out[idx] = c0 + t[:, None] * d[None, :]
        fixed[idx] = True
    # 2) ostalo: zakrivljeni dijelovi jače glađenje (valovi flomastera), uglovi blaže (da ostanu oštri)
    sm_curve = smooth_closed(p, sigma_curve)
    sm_corner = smooth_closed(p, sigma_corner)
    corner_mask = np.zeros(n, bool)
    for s_, e_ in corner_spans:
        if s_ <= e_:
            corner_mask[s_:e_ + 1] = True
        else:
            corner_mask[s_:] = True; corner_mask[:e_ + 1] = True
    sm = np.where(corner_mask[:, None], sm_corner, sm_curve)
    out[~fixed] = sm[~fixed]
    # 3) uglađivanje prijelaza: linearno rasteži svaki nefiksni blok tako da mu krajevi sjednu na fiksne susjede
    if fixed.any() and (~fixed).any():
        start = int(np.argmax(np.diff(fixed.astype(int), prepend=fixed[-1]) == -1))   # prvi nefiksni nakon fiksnog
        order = (np.arange(n) + start) % n
        f = fixed[order]
        i = 0
        while i < n:
            if f[i]:
                i += 1
                continue
            j = i
            while j < n and not f[j]:
                j += 1
            blk = order[i:j]
            prev_i, next_i = order[(i - 1) % n], order[j % n]
            if fixed[prev_i] and fixed[next_i] and len(blk) > 2:
                da = out[prev_i] - sm[prev_i]
                db = out[next_i] - sm[next_i]
                w = np.linspace(0, 1, len(blk) + 2)[1:-1][:, None]
                out[blk] = sm[blk] + (1 - w) * da + w * db
            i = j
    return out


def finish(poly_mm: np.ndarray, square_corner_mm=None):
    p = resample_closed(poly_mm, 1.0)
    p = smooth_closed(p, 2.0)
    p = ensure_ccw(p)
    p = iron(p)
    if square_corner_mm is not None:                      # nakon peglanja, da glađenje ne zaobli kut
        p = square_corner(ensure_ccw(p), np.asarray(square_corner_mm, float))
    p = simplify_closed(p, 0.15)
    p = ensure_ccw(p)
    i0 = int(np.argmin(p[:, 0] + p[:, 1]))
    return np.roll(p, -i0, axis=0)


# --------------------------------------------------------------------------- mjerenje
def snap_origin(img, guess, name: str):
    """Približno ishodište -> najbliže presjecište dviju obitelji crvenih linija; sprema kontrolnu sliku
    detekcije (linije + zadano i zalijepljeno ishodište)."""
    red = redness(img)
    fams = [detect_family(red, vertical=True), detect_family(red, vertical=False)]
    g = np.asarray(guess, float)
    best, bd = None, 1e9
    for p0, d, _ in fams[0]:
        for q0, e_, _ in fams[1]:
            A = np.array([d, -e_]).T
            if abs(np.linalg.det(A)) < 1e-6:
                continue
            t = np.linalg.solve(A, q0 - p0)
            x = p0 + t[0] * d
            dist = np.hypot(*(x - g))
            if dist < bd:
                bd, best = dist, x
    os.makedirs(CTL, exist_ok=True)
    vis = img.copy()
    for fam, col in zip(fams, ((0, 0, 255), (0, 160, 0))):
        for p0, d, _ in fam:
            a = (p0 - d * 3000).astype(int); b = (p0 + d * 3000).astype(int)
            cv2.line(vis, tuple(a), tuple(b), col, 1)
    cv2.circle(vis, tuple(int(v) for v in g), 25, (255, 0, 0), 3)
    if best is not None:
        cv2.circle(vis, tuple(int(v) for v in best), 18, (0, 255, 255), 3)
    cv2.imwrite(os.path.join(CTL, name.replace(".jpg", "_mreza.jpg")), cv2.resize(vis, None, fx=0.5, fy=0.5), [cv2.IMWRITE_JPEG_QUALITY, 70])
    if best is None:
        return g
    log.info("  ishodište: zadano %s -> presjecište %s (pomak %.0f px)", tuple(int(v) for v in g), tuple(int(v) for v in best), bd)
    return best


def process(e: dict) -> dict:
    path = os.path.join(HERE, "fotke", e["file"])
    img = cv2.imread(path)
    log.info("== %s (%s)", e["layer"], e["file"])
    origin = snap_origin(img, e["origin"], e["file"])
    xdir, ydir = axes_from_points(origin, e["axis"])
    g = detect_grid(img, origin, xdir, ydir, None, min_total_len=e.get("min_total_len", 350.0))
    xr = (-MARGIN_CM, g.x_range[1] + MARGIN_CM)
    yr = (-MARGIN_CM, g.y_range[1] + MARGIN_CM)
    rect = rectify(img, g, xr, yr, R)
    # barijera 3 mm izvan osi papira: folija koja leži na osi ima potez koji se stapa s crvenom linijom
    # i rubom papira, pa rast područja ne smije izaći s papira (x < -0.3 cm, y < -0.3 cm)
    u0 = int(round((-0.3 - xr[0]) * R)); v0 = int(round((yr[1] + 0.3) * R))
    cv2.line(rect, (u0, 0), (u0, rect.shape[0]), (0, 0, 0), 3)
    cv2.line(rect, (0, v0), (rect.shape[1], v0), (0, 0, 0), 3)
    Hinv = np.linalg.inv(g.H)
    masks, strokes = [], []
    seeds_cm = [cv2.perspectiveTransform(np.array([[s]], np.float64), Hinv).reshape(2) for s in e.get("seeds", [])]
    seeds_cm += [np.asarray(s, float) for s in e.get("seeds_cm", [])]
    for seed_cm in seeds_cm:
        seed = to_rect_px(np.array([seed_cm], float), xr, yr, R)[0]
        _, stroke, inner = extract_outline(rect, seed)
        masks.append(inner > 0)
        strokes.append(stroke)
    union = np.zeros(rect.shape[:2], np.uint8)
    for m in masks:
        union[m] = 255
    if len(masks) > 1:                                    # zatvori prorez dijagonalne linije između dijelova
        union = cv2.morphologyEx(union, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    cnts, _ = cv2.findContours(union, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cnts, key=cv2.contourArea).reshape(-1, 2).astype(float)
    # kontura = središnjica poteza: pola debljine prema van
    stroke_med = float(np.median(np.concatenate(strokes)))
    poly_mm = to_cm(c, xr, yr, R) * 10.0
    pg = Polygon(poly_mm).buffer(stroke_med / 2.0, join_style="round")
    poly_mm = np.array(pg.exterior.coords)[:-1]
    sq = None if not e.get("square_corner_cm") else np.asarray(e["square_corner_cm"], float) * 10.0
    p = finish(poly_mm, sq)
    corners = find_corners(p)
    per = perimeter(p)
    bb0, bb1 = p.min(0), p.max(0)
    log.info("  kontura: %d točaka, opseg %.0f mm, gabarit %.0f x %.0f mm, čvorova %d, RMS %.2f px, uglova %d",
             len(p), per, bb1[0] - bb0[0], bb1[1] - bb0[1], len(g.nodes_cm), g.resid_h_px, len(corners))
    # kontrolna slika: ispravljena + kontura
    os.makedirs(CTL, exist_ok=True)
    vis = rect.copy()
    pp = to_rect_px(p / 10.0, xr, yr, R).astype(np.int32)
    cv2.polylines(vis, [pp], True, (0, 255, 0), 2)
    for cc in g.nodes_cm:
        u, v = to_rect_px(cc.reshape(1, 2), xr, yr, R)[0]
        cv2.circle(vis, (int(u), int(v)), 5, (255, 0, 255), 1)
    cv2.imwrite(os.path.join(CTL, e["file"].replace(".jpg", "_kontura.jpg")), vis, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return dict(key=e["file"][:2], layer=e["layer"], file=e["file"], poly_mm=p, corners=corners, perimeter_mm=per,
                bbox_mm=(bb0.tolist(), bb1.tolist()), grid_nodes=len(g.nodes_cm), homography_rms_px=float(g.resid_h_px),
                stroke_mm=stroke_med)


# --------------------------------------------------------------------------- izlaz
def write_outputs(results):
    import ezdxf
    from ezdxf import units
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    doc = ezdxf.new("R2010", setup=True)
    doc.units = units.MM
    doc.header["$INSUNITS"] = 4
    msp = doc.modelspace()
    doc.layers.add("KOTE", color=8)
    doc.layers.add("TEKST", color=7)
    x = 0.0
    for i, r in enumerate(results):
        lay = r["layer"]
        doc.layers.add(lay, color=[1, 3, 5, 6, 2, 4, 30, 40, 50, 60, 70, 80, 90][i % 13])
        (x0, y0), (x1, y1) = r["bbox_mm"]
        t = np.array([x - x0, -y0])
        q = r["poly_mm"] + t
        msp.add_lwpolyline(q.tolist(), format="xy", close=True, dxfattribs={"layer": lay})
        msp.add_text(lay, height=30, dxfattribs={"layer": "TEKST"}).set_placement(((x + x1 - x0) / 2 + x / 2, (y1 - y0) / 2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
        msp.add_text(f"{x1-x0:.0f} x {y1-y0:.0f} mm, opseg {r['perimeter_mm']:.0f} mm", height=15, dxfattribs={"layer": "TEKST"}).set_placement((x, -40))
        d = msp.add_linear_dim(base=(x, -80), p1=(x, 0), p2=(x + x1 - x0, 0), angle=0, dimstyle="EZDXF", dxfattribs={"layer": "KOTE"},
                               override={"dimtxt": 25, "dimasz": 15, "dimdec": 0})
        d.render()
        d = msp.add_linear_dim(base=(x - 80, 0), p1=(x, 0), p2=(x, y1 - y0), angle=90, dimstyle="EZDXF", dxfattribs={"layer": "KOTE"},
                               override={"dimtxt": 25, "dimasz": 15, "dimdec": 0})
        d.render()
        x += (x1 - x0) + 300
    doc.saveas(os.path.join(OUT, "konture_1_1.dxf"))

    # PDF 1:10: A4 uspravno, crtaće polje 190 x 277 mm = 1900 x 2770 mm stvarno
    A4 = (210.0, 297.0)
    M = 10.0
    with PdfPages(os.path.join(OUT, "konture_1_10.pdf")) as pdf:
        fig = plt.figure(figsize=(A4[0] / 25.4, A4[1] / 25.4))
        ax = fig.add_axes([0.06, 0.05, 0.9, 0.9]); ax.axis("off")
        lines = ["KONTURE KROJNIH UZORAKA · mjerilo 1:10 (ispis u stvarnoj veličini, bez skaliranja)", "",
                 "Konture su središnjice crnog poteza s folije, 'ispeglane': ravni dijelovi su pravci, zaobljenja glatke krivulje.",
                 "DXF konture_1_1.dxf je 1:1 u mm (svaki element na svom sloju).", ""]
        lines += [f"{i+1:2d}. {r['layer']:<28s} {r['bbox_mm'][1][0]-r['bbox_mm'][0][0]:6.0f} x {r['bbox_mm'][1][1]-r['bbox_mm'][0][1]:5.0f} mm   opseg {r['perimeter_mm']:5.0f} mm   (mreža: {r['grid_nodes']} čvorova, ostatak {r['homography_rms_px']:.1f} px)"
                  for i, r in enumerate(results)]
        ax.text(0, 1, "\n".join(lines), va="top", fontsize=7.5, family="monospace")
        pdf.savefig(fig); plt.close(fig)
        for r in results:
            (x0, y0), (x1, y1) = r["bbox_mm"]
            w, h = (x1 - x0) / 10.0, (y1 - y0) / 10.0          # mm na papiru
            landscape = w > 190 - 20 and w > h
            PW, PH = (A4[1], A4[0]) if landscape else A4
            fig = plt.figure(figsize=(PW / 25.4, PH / 25.4))
            ax = fig.add_axes([M / PW, M / PH, (PW - 2 * M) / PW, (PH - 2 * M) / PH])
            ax.set_xlim(0, (PW - 2 * M) * 10); ax.set_ylim(0, (PH - 2 * M) * 10); ax.set_aspect("equal"); ax.axis("off")
            ox, oy = 150.0, 250.0                                # položaj elementa (mm stvarno) unutar polja
            q = r["poly_mm"] - [x0, y0] + [ox, oy]
            qq = np.vstack([q, q[:1]])
            ax.plot(qq[:, 0], qq[:, 1], "k-", lw=1.0)
            # mreža 100 mm (svijetlo) i kote
            for gx in np.arange(0, (PW - 2 * M) * 10 + 1, 100):
                ax.axvline(gx, color="#f0d0d0", lw=0.3, zorder=0)
            for gy in np.arange(0, (PH - 2 * M) * 10 + 1, 100):
                ax.axhline(gy, color="#f0d0d0", lw=0.3, zorder=0)
            ax.annotate("", xy=(ox + (x1 - x0), oy - 100), xytext=(ox, oy - 100), arrowprops=dict(arrowstyle="<->", lw=0.7))
            ax.text(ox + (x1 - x0) / 2, oy - 90, f"{x1-x0:.0f} mm", ha="center", va="bottom", fontsize=8)
            ax.annotate("", xy=(ox - 100, oy + (y1 - y0)), xytext=(ox - 100, oy), arrowprops=dict(arrowstyle="<->", lw=0.7))
            ax.text(ox - 90, oy + (y1 - y0) / 2, f"{y1-y0:.0f} mm", ha="left", va="center", rotation=90, fontsize=8)
            # kontrolna skala: 1000 mm stvarno = 100 mm na papiru
            sx, sy = ox, oy - 200
            ax.plot([sx, sx + 1000], [sy, sy], "k-", lw=1.2); ax.plot([sx, sx], [sy - 15, sy + 15], "k-", lw=1.2); ax.plot([sx + 1000, sx + 1000], [sy - 15, sy + 15], "k-", lw=1.2)
            ax.text(sx + 500, sy - 25, "kontrola: 100 mm na papiru = 1000 mm stvarno (mjerilo 1:10)", ha="center", va="top", fontsize=6.5)
            ax.text(ox, oy + (y1 - y0) + 60, f"{r['layer']}   ·   {x1-x0:.0f} × {y1-y0:.0f} mm   ·   opseg {r['perimeter_mm']:.0f} mm   ·   M 1:10",
                    fontsize=9, weight="bold")
            pdf.savefig(fig); plt.close(fig)

    js = [dict(layer=r["layer"], file=r["file"], perimeter_mm=round(r["perimeter_mm"], 1), bbox_mm=r["bbox_mm"],
               poly_mm=np.round(r["poly_mm"], 2).tolist(), grid_nodes=r["grid_nodes"], homography_rms_px=round(r["homography_rms_px"], 2))
          for r in results]
    with open(os.path.join(OUT, "konture_mm.json"), "w", encoding="utf-8") as f:
        json.dump(js, f, ensure_ascii=False, indent=1)


def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]
    results = []
    for e in ELEMENTS:
        if only and e["file"][:2] not in only:
            continue
        try:
            results.append(process(e))
        except Exception as ex:                        # noqa: BLE001
            log.error("  GREŠKA %s: %s", e["file"], ex)
    if not only:
        write_outputs(results)
        log.info("gotovo -> %s", OUT)


if __name__ == "__main__":
    main()
