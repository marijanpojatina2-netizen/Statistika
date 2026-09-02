"""Zapis DXF (mm, 1:1) i PDF pregleda."""
from __future__ import annotations

import ezdxf
from ezdxf import units
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                     # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
import numpy as np                                  # noqa: E402
from shapely.geometry import Polygon                # noqa: E402

from contour import simplify_closed, perimeter, resample_closed  # noqa: E402

GAP = 100.0        # razmak elemenata u crtežu (mm)
STRIP_H = 90.0     # širina trake (mm)
OFFSET = 10.0      # offset prema van (mm)
COLORS = [1, 3, 5, 6]  # ACI boje slojeva
A3 = (16.54, 11.69)    # inch, landscape


# --------------------------------------------------------------------------- pomoćno
def layout(results, mode: str):
    """Položaj svakog elementa u crtežu. 'row': jedan do drugog, 'stack': jedan iznad drugog
    (traka ispod svakog). Vraća listu translacija (dx, dy) tako da bbox-min sjedne na zadano mjesto."""
    pos = []
    x = y = 0.0
    for r in results:
        (x0, y0), (x1, y1) = r["bbox_mm"]
        if mode == "row":
            pos.append((x - x0, -y0))
            x += (x1 - x0) + GAP
        else:
            pos.append((-x0, y - y0))
            y -= (y1 - y0) + STRIP_H + 3 * GAP
            # rezerviraj širinu za traku
    return pos


def offset_polygon(poly_mm: np.ndarray, d: float) -> np.ndarray:
    pg = Polygon(poly_mm).buffer(d, join_style="round", quad_segs=24)
    ext = np.array(pg.exterior.coords)[:-1]
    return simplify_closed(ext, 0.2)


def _closed(p):
    return np.vstack([p, p[:1]])


def _new_doc():
    doc = ezdxf.new("R2010", setup=True)
    doc.units = units.MM
    doc.header["$INSUNITS"] = 4
    doc.header["$MEASUREMENT"] = 1
    doc.header["$LUNITS"] = 2
    return doc


def _dim(msp, p1, p2, base, angle, layer):
    d = msp.add_linear_dim(base=base, p1=p1, p2=p2, angle=angle, dimstyle="EZDXF",
                           dxfattribs={"layer": layer},
                           override={"dimtxt": 25, "dimasz": 15, "dimdec": 0, "dimexe": 10, "dimexo": 5})
    d.render()


def strip_marks(r):
    """Oznake po traci: (s_mm, tekst, vrsta) - početak, uglovi (poč/vrh/kraj), kraj."""
    marks = [(0.0, "POČETAK 0", "full")]
    for i, c in enumerate(r["corners"], 1):
        marks.append((c["s_start"], f"U{i} poč {c['s_start']:.0f}", "full"))
        marks.append((c["s_apex"], f"U{i} vrh {c['s_apex']:.0f}", "half"))
        marks.append((c["s_end"], f"U{i} kraj {c['s_end']:.0f}", "full"))
    marks.append((r["perimeter_mm"], f"KRAJ {r['perimeter_mm']:.0f}", "full"))
    return marks


# --------------------------------------------------------------------------- File 1
def write_elements_1_1(results, base):
    doc = _new_doc()
    msp = doc.modelspace()
    doc.layers.add("KOTE", color=8)
    pos = layout(results, "row")
    for i, (r, (dx, dy)) in enumerate(zip(results, pos)):
        lay = r["layer"]
        doc.layers.add(lay, color=COLORS[i % len(COLORS)])
        p = r["poly_mm"] + np.array([dx, dy])
        msp.add_lwpolyline(p.tolist(), format="xy", close=True, dxfattribs={"layer": lay})
        (x0, y0), (x1, y1) = p.min(0), p.max(0)
        msp.add_text(lay, height=30, dxfattribs={"layer": lay}).set_placement(((x0 + x1) / 2, (y0 + y1) / 2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
        msp.add_text(f"opseg {r['perimeter_mm']:.0f} mm", height=15, dxfattribs={"layer": lay}).set_placement(((x0 + x1) / 2, (y0 + y1) / 2 - 45), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
        _dim(msp, (x0, y0), (x1, y0), (x0, y0 - 60), 0, "KOTE")
        _dim(msp, (x0, y0), (x0, y1), (x0 - 60, y0), 90, "KOTE")
    doc.saveas(base + ".dxf")

    with PdfPages(base + ".pdf") as pdf:
        # pregledna stranica
        fig, ax = plt.subplots(figsize=A3)
        for i, (r, (dx, dy)) in enumerate(zip(results, pos)):
            p = _closed(r["poly_mm"] + np.array([dx, dy]))
            ax.plot(p[:, 0], p[:, 1], color=f"C{i}", lw=1.2)
            (x0, y0), (x1, y1) = p.min(0), p.max(0)
            ax.text((x0 + x1) / 2, (y0 + y1) / 2, f"{r['layer']}\n{x1-x0:.0f} x {y1-y0:.0f} mm", ha="center", va="center", fontsize=8)
        _grid(ax)
        ax.set_aspect("equal")
        ax.set_title("elementi_1_1 - pregled (mreža 100 mm / 50 mm), jedinice mm")
        pdf.savefig(fig)
        plt.close(fig)
        for i, r in enumerate(results):
            fig, ax = plt.subplots(figsize=A3)
            p = _closed(r["poly_mm"])
            ax.plot(p[:, 0], p[:, 1], color=f"C{i}", lw=1.5)
            (x0, y0), (x1, y1) = p.min(0), p.max(0)
            _dim_mpl(ax, (x0, y0 - 40), (x1, y0 - 40), f"{x1-x0:.0f}")
            _dim_mpl(ax, (x0 - 40, y0), (x0 - 40, y1), f"{y1-y0:.0f}", vertical=True)
            _grid(ax, x0 - 100, x1 + 100, y0 - 100, y1 + 100)
            ax.set_aspect("equal")
            ax.set_title(f"{r['layer']}  -  gabarit {x1-x0:.0f} x {y1-y0:.0f} mm, opseg {r['perimeter_mm']:.0f} mm  (koordinate papira, mm)")
            pdf.savefig(fig)
            plt.close(fig)


def _grid(ax, x0=None, x1=None, y0=None, y1=None):
    ax.margins(0.05)
    if x0 is None:
        x0, x1 = ax.get_xlim()
        y0, y1 = ax.get_ylim()
    x0, y0 = np.floor(x0 / 100) * 100, np.floor(y0 / 100) * 100
    x1, y1 = np.ceil(x1 / 100) * 100, np.ceil(y1 / 100) * 100
    for x in np.arange(x0, x1 + 1, 50):
        ax.axvline(x, color="#e88" if x % 100 == 0 else "#f5cccc", lw=0.6 if x % 100 == 0 else 0.3, zorder=0)
    for y in np.arange(y0, y1 + 1, 50):
        ax.axhline(y, color="#e88" if y % 100 == 0 else "#f5cccc", lw=0.6 if y % 100 == 0 else 0.3, zorder=0)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_xticks(np.arange(x0, x1 + 1, 100))
    ax.set_yticks(np.arange(y0, y1 + 1, 100))
    ax.tick_params(labelsize=6)
    ax.set_xlabel("mm", fontsize=7)


def _dim_mpl(ax, a, b, text, vertical=False):
    ax.annotate("", xy=a, xytext=b, arrowprops=dict(arrowstyle="<->", color="k", lw=0.8))
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    ax.text(mx, my, text, ha="center", va="bottom" if not vertical else "center", rotation=90 if vertical else 0,
            fontsize=8, backgroundcolor="white")


# --------------------------------------------------------------------------- File 2
def write_strip_offset(results, base):
    doc = _new_doc()
    msp = doc.modelspace()
    doc.layers.add("KOTE", color=8)
    pos = layout(results, "stack")
    offs = [offset_polygon(r["poly_mm"], OFFSET) for r in results]
    for i, (r, (dx, dy), o) in enumerate(zip(results, pos, offs)):
        lay = r["layer"]
        col = COLORS[i % len(COLORS)]
        doc.layers.add(f"{lay} KONTURA", color=8)
        doc.layers.add(f"{lay} OFFSET", color=col)
        doc.layers.add(f"{lay} TRAKA", color=col)
        t = np.array([dx, dy])
        p = r["poly_mm"] + t
        msp.add_lwpolyline(p.tolist(), format="xy", close=True, dxfattribs={"layer": f"{lay} KONTURA"})
        po = o + t
        msp.add_lwpolyline(po.tolist(), format="xy", close=True, dxfattribs={"layer": f"{lay} OFFSET"})
        (x0, y0), (x1, y1) = po.min(0), po.max(0)
        msp.add_text(f"{lay} - OFFSET +{OFFSET:.0f} mm", height=25, dxfattribs={"layer": f"{lay} OFFSET"}).set_placement(((x0 + x1) / 2, (y0 + y1) / 2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
        _dim(msp, (x0, y0), (x1, y0), (x0, y0 - 50), 0, "KOTE")
        _dim(msp, (x0, y0), (x0, y1), (x0 - 50, y0), 90, "KOTE")
        # oznake uglova na konturi
        msp.add_circle(tuple(p[0]), 6, dxfattribs={"layer": f"{lay} TRAKA"})
        msp.add_text("POČETAK TRAKE", height=10, dxfattribs={"layer": f"{lay} TRAKA"}).set_placement((p[0][0] + 10, p[0][1] - 20))
        for k, c in enumerate(r["corners"], 1):
            for key in ("p_start", "p_end"):
                q = np.asarray(c[key]) + t
                msp.add_circle(tuple(q), 4, dxfattribs={"layer": f"{lay} TRAKA"})
            q = np.asarray(c["p_apex"]) + t
            msp.add_text(f"U{k}", height=12, dxfattribs={"layer": f"{lay} TRAKA"}).set_placement((q[0], q[1]), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
        # traka
        L = r["perimeter_mm"]
        sy = y0 - 2 * GAP          # gornji rub trake
        sx = x0
        rect = [(sx, sy), (sx + L, sy), (sx + L, sy - STRIP_H), (sx, sy - STRIP_H)]
        msp.add_lwpolyline(rect, format="xy", close=True, dxfattribs={"layer": f"{lay} TRAKA"})
        msp.add_text(f"{lay} - TRAKA {STRIP_H:.0f} x {L:.0f} mm  (opseg konture; početak = točka konture najbliža ishodištu, smjer CCW)",
                     height=12, dxfattribs={"layer": f"{lay} TRAKA"}).set_placement((sx, sy + 15))
        for s, txt, kind in strip_marks(r):
            h = STRIP_H if kind == "full" else STRIP_H / 3
            msp.add_line((sx + s, sy), (sx + s, sy - h), dxfattribs={"layer": f"{lay} TRAKA"})
            msp.add_text(txt, height=8, rotation=90, dxfattribs={"layer": f"{lay} TRAKA"}).set_placement((sx + s + 3, sy - STRIP_H - 5), align=ezdxf.enums.TextEntityAlignment.TOP_LEFT)
        _dim(msp, (sx, sy - STRIP_H), (sx + L, sy - STRIP_H), (sx, sy - STRIP_H - 80), 0, "KOTE")
    doc.saveas(base + ".dxf")

    with PdfPages(base + ".pdf") as pdf:
        for i, (r, o) in enumerate(zip(results, offs)):
            fig = plt.figure(figsize=A3)
            gs = fig.add_gridspec(2, 1, height_ratios=[4, 1.3])
            ax = fig.add_subplot(gs[0])
            p = _closed(r["poly_mm"])
            po = _closed(o)
            ax.plot(p[:, 0], p[:, 1], color="gray", lw=0.8, label="kontura")
            ax.plot(po[:, 0], po[:, 1], color=f"C{i}", lw=1.5, label=f"offset +{OFFSET:.0f} mm")
            ax.plot(p[0, 0], p[0, 1], "ko", ms=4)
            ax.text(p[0, 0] + 8, p[0, 1] - 15, "početak trake", fontsize=7)
            for k, c in enumerate(r["corners"], 1):
                ax.plot([c["p_start"][0], c["p_end"][0]], [c["p_start"][1], c["p_end"][1]], "o", color="orange", ms=3)
                ax.text(c["p_apex"][0], c["p_apex"][1], f"U{k}", fontsize=8, ha="center", va="center", color="red")
            (x0, y0), (x1, y1) = po.min(0), po.max(0)
            _dim_mpl(ax, (x0, y0 - 40), (x1, y0 - 40), f"{x1-x0:.0f}")
            _dim_mpl(ax, (x0 - 40, y0), (x0 - 40, y1), f"{y1-y0:.0f}", vertical=True)
            _grid(ax, x0 - 100, x1 + 100, y0 - 100, y1 + 100)
            ax.set_aspect("equal")
            ax.legend(fontsize=7, loc="upper right")
            ax.set_title(f"{r['layer']} - offset +{OFFSET:.0f} mm (gabarit {x1-x0:.0f} x {y1-y0:.0f} mm); traka {STRIP_H:.0f} x {r['perimeter_mm']:.0f} mm")
            ax2 = fig.add_subplot(gs[1])
            L = r["perimeter_mm"]
            ax2.add_patch(plt.Rectangle((0, 0), L, STRIP_H, fill=False, lw=1.2))
            for s, txt, kind in strip_marks(r):
                h = STRIP_H if kind == "full" else STRIP_H / 3
                ax2.plot([s, s], [STRIP_H, STRIP_H - h], color="red" if kind == "full" else "orange", lw=0.8)
                ax2.text(s, -8, txt, rotation=90, fontsize=6, ha="center", va="top")
            ax2.set_xlim(-20, L + 20)
            ax2.set_ylim(-140, STRIP_H + 20)
            ax2.set_yticks([0, STRIP_H])
            ax2.tick_params(labelsize=6)
            ax2.set_xlabel("duljina po traci [mm] (traka nije u istom mjerilu kao element)", fontsize=7)
            ax2.set_aspect("auto")
            pdf.savefig(fig)
            plt.close(fig)
