"""Zapis krojeva: DXF 1:1 (svi dijelovi, slojevi po elementu i dijelu, zarezi, tekst) i PDF 1:1 slijepljen
iz A4/A3 stranica (lice i spužva po stranicama s oznakama preklopa i kontrolnim kvadratom; traka i dno
kao kotirani crtež + tablica zareza)."""
from __future__ import annotations

import ezdxf
from ezdxf import units
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                     # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
import numpy as np                                  # noqa: E402

from .pattern import PAGES                          # noqa: E402

MARGIN = 10.0          # mm rub stranice
OVERLAP = 10.0         # mm preklop susjednih stranica
COLORS = {"LICE": 1, "DNO": 3, "TRAKA": 5, "SPUZVA": 6}


def _closed(p):
    return np.vstack([p, p[:1]])


def _new_doc():
    doc = ezdxf.new("R2010", setup=True)
    doc.units = units.MM
    doc.header["$INSUNITS"] = 4
    return doc


def layout(elements: list, gap: float = 100.0) -> list:
    """Položaj dijelova u DXF-u: po elementu jedan redak (LICE, DNO, SPUŽVA jedan do drugog), traka ispod."""
    placed = []
    y = 0.0
    for el in elements:
        parts = el["kroj"]["parts"]
        x = 0.0
        row_h = 0.0
        for p in parts:
            if p["name"] == "TRAKA":
                continue
            (x0, y0), (x1, y1) = p["poly"].min(0), p["poly"].max(0)
            placed.append((el, p, np.array([x - x0, y - y0])))
            x += (x1 - x0) + gap
            row_h = max(row_h, y1 - y0)
        strip = next(p for p in parts if p["name"] == "TRAKA")
        sy = y + row_h + gap
        placed.append((el, strip, np.array([0.0, sy])))
        y = sy + strip["poly"][:, 1].max() + gap * 2
    return placed


def write_dxf(elements: list, path: str):
    doc = _new_doc()
    msp = doc.modelspace()
    for el, p, t in layout(elements):
        lay = f"{el['layer']} {p['name']}"
        if lay not in doc.layers:
            doc.layers.add(lay, color=COLORS.get(p["name"], 7))
        zl = f"{el['layer']} ZAREZI"
        if zl not in doc.layers:
            doc.layers.add(zl, color=2)
        tl = f"{el['layer']} TEKST"
        if tl not in doc.layers:
            doc.layers.add(tl, color=8)
        q = p["poly"] + t
        msp.add_lwpolyline(q.tolist(), format="xy", close=True, dxfattribs={"layer": lay})
        if p.get("sew") is not None:
            msp.add_lwpolyline((p["sew"] + t).tolist(), format="xy", close=True, dxfattribs={"layer": lay, "linetype": "DASHED"})
        for a, b, lab in p["notches"]:
            msp.add_line(tuple(a + t), tuple(b + t), dxfattribs={"layer": zl})
            if lab != "z":
                msp.add_text(lab, height=6, dxfattribs={"layer": zl}).set_placement(tuple(b + t + [2, 2]))
        for r0, r1 in p.get("zip_ranges", []):
            H = p["poly"][:, 1].max()
            msp.add_line((r0 + t[0], H / 2 + t[1]), (r1 + t[0], H / 2 + t[1]), dxfattribs={"layer": zl, "linetype": "DASHDOT"})
        (x0, y0), (x1, y1) = q.min(0), q.max(0)
        yy = (y0 + y1) / 2 + 20 * (len(p["texts"]) - 1)
        for txt, h in p["texts"]:
            msp.add_text(txt, height=h * 0.6, dxfattribs={"layer": tl}).set_placement(((x0 + x1) / 2, yy), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
            yy -= h * 1.2
        if p.get("grain"):
            cx, cy = (x0 + x1) / 2, y0 + 40
            msp.add_line((cx - 60, cy), (cx + 60, cy), dxfattribs={"layer": tl})
            msp.add_text("smjer tkanine", height=8, dxfattribs={"layer": tl}).set_placement((cx - 60, cy + 4))
    doc.saveas(path)


# --------------------------------------------------------------------------- PDF 1:1
def _draw_part(ax, p, t=(0.0, 0.0), lw=1.2):
    q = _closed(p["poly"] + t)
    ax.plot(q[:, 0], q[:, 1], "k-", lw=lw)
    if p.get("sew") is not None:
        s = _closed(p["sew"] + t)
        ax.plot(s[:, 0], s[:, 1], "k--", lw=0.5)
    for a, b, lab in p["notches"]:
        ax.plot([a[0] + t[0], b[0] + t[0]], [a[1] + t[1], b[1] + t[1]], "r-", lw=1.0)
        if lab != "z":
            ax.text(b[0] + t[0] + 2, b[1] + t[1] + 2, lab, fontsize=5, color="r")
    for r0, r1 in p.get("zip_ranges", []):
        H = p["poly"][:, 1].max()
        ax.plot([r0 + t[0], r1 + t[0]], [H / 2 + t[1], H / 2 + t[1]], "r-.", lw=1.0)
        ax.text(r0 + t[0], H / 2 + t[1] + 3, "CIF", fontsize=6, color="r")
    (x0, y0), (x1, y1) = (p["poly"] + t).min(0), (p["poly"] + t).max(0)
    yy = (y0 + y1) / 2 + 12 * (len(p["texts"]) - 1)
    for txt, h in p["texts"]:
        ax.text((x0 + x1) / 2, yy, txt, ha="center", va="center", fontsize=max(6, h * 0.35))
        yy -= h * 0.8
    if p.get("grain"):
        cx, cy = (x0 + x1) / 2, y0 + 40
        ax.annotate("", xy=(cx + 60, cy), xytext=(cx - 60, cy), arrowprops=dict(arrowstyle="<->", lw=1))
        ax.text(cx, cy + 4, "smjer tkanine", ha="center", fontsize=6)


def tiled_pages(pdf, el, p, page: str):
    """Dio 1:1 razrezan na stranice s preklopom i oznakama; kontrolni kvadrat 100 mm na svakoj stranici."""
    PW, PH = PAGES[page]
    tw, th = PW - 2 * MARGIN, PH - 2 * MARGIN                 # crtaće područje po stranici
    sw, sh = tw - OVERLAP, th - OVERLAP                        # korak stranica
    (x0, y0), (x1, y1) = p["poly"].min(0) - 15, p["poly"].max(0) + 15
    nc, nr = int(np.ceil((x1 - x0) / sw)), int(np.ceil((y1 - y0) / sh))
    for r in range(nr):
        for c in range(nc):
            px0, py0 = x0 + c * sw, y0 + r * sh
            fig = plt.figure(figsize=(PW / 25.4, PH / 25.4))
            ax = fig.add_axes([MARGIN / PW, MARGIN / PH, tw / PW, th / PH])
            ax.set_xlim(px0, px0 + tw); ax.set_ylim(py0, py0 + th); ax.set_aspect("equal"); ax.axis("off")
            _draw_part(ax, p)
            # oznake preklopa: križići u uglovima crtaćeg područja + crtkani okvir preklopa
            for cx in (px0, px0 + tw):
                for cy in (py0, py0 + th):
                    ax.plot([cx - 5, cx + 5], [cy, cy], "k-", lw=0.5); ax.plot([cx, cx], [cy - 5, cy + 5], "k-", lw=0.5)
            ax.plot([px0 + OVERLAP] * 2, [py0, py0 + th], "k:", lw=0.4); ax.plot([px0, px0 + tw], [py0 + OVERLAP] * 2, "k:", lw=0.4)
            # kontrolni kvadrat 100 mm (gore desno)
            ax.add_patch(plt.Rectangle((px0 + tw - 110, py0 + th - 110), 100, 100, fill=False, lw=0.6))
            ax.text(px0 + tw - 60, py0 + th - 60, "100 mm", ha="center", va="center", fontsize=6)
            ax.text(px0 + 2, py0 + th - 6, f"{el['layer']} · {p['name']} · stranica red {r + 1}/{nr}, stupac {c + 1}/{nc} · {page} 1:1 · preklop {OVERLAP:.0f} mm, lijepi po križićima",
                    fontsize=6)
            pdf.savefig(fig)
            plt.close(fig)


def write_pdf(elements: list, path: str, page: str = "A4"):
    PW, PH = PAGES[page]
    with PdfPages(path) as pdf:
        # naslovna: pregled dijelova i popis
        fig = plt.figure(figsize=(PH / 25.4, PW / 25.4))
        ax = fig.add_axes([0.05, 0.05, 0.9, 0.85]); ax.axis("off")
        lines = [f"KROJEVI 1:1 · {len(elements)} elemenata · ispis u stvarnoj veličini (100 %), provjeri kvadrat 100 mm na svakoj stranici", ""]
        for el in elements:
            b = el["kroj"]["bom"]
            lines.append(f"{el['layer']}: lice+dno+traka {b['fabric_m2']} m² ({b['material']}, rola {b['roll_width_mm']} mm), traka {b['strip_height_mm']} x {b['strip_length_mm']} mm, "
                         f"spužva {b['foam_m2']} m² x {b['foam_thickness_mm']} mm, zareza {b['n_notches']}")
        lines += ["", "Stranice: LICE i SPUŽVA 1:1 po stranicama (slijepi po križićima s preklopom), DNO = LICE zrcaljeno (okreni šablonu),",
                  "TRAKA = pravokutnik: nacrtaj po mjerama i prenesi zareze iz tablice (udaljenosti od lijevog ruba trake)."]
        ax.text(0, 1, "\n".join(lines), va="top", fontsize=8, family="monospace")
        pdf.savefig(fig); plt.close(fig)
        for el in elements:
            parts = {p["name"]: p for p in el["kroj"]["parts"]}
            # pregled elementa: svi dijelovi umanjeno
            fig = plt.figure(figsize=(PH / 25.4, PW / 25.4))
            ax = fig.add_axes([0.04, 0.06, 0.92, 0.86]); ax.set_aspect("equal")
            x = 0.0
            for name in ("LICE", "DNO", "SPUZVA"):
                p = parts[name]; (x0, y0), (x1, y1) = p["poly"].min(0), p["poly"].max(0)
                _draw_part(ax, p, (x - x0, -y0), lw=0.8)
                x += (x1 - x0) + 80
            st = parts["TRAKA"]; _draw_part(ax, st, (0, -st["poly"][:, 1].max() - 120), lw=0.8)
            ax.set_title(f"{el['layer']} · pregled dijelova (nije 1:1)", fontsize=9)
            ax.margins(0.05); ax.tick_params(labelsize=6)
            pdf.savefig(fig); plt.close(fig)
            # tablica zareza za traku
            fig = plt.figure(figsize=(PW / 25.4, PH / 25.4)); ax = fig.add_axes([0.06, 0.05, 0.88, 0.9]); ax.axis("off")
            seam = el["kroj"]["rules"]["seam_mm"]
            rows = [(lab, f"{s:.0f}", f"{s + seam:.0f}") for s, lab in el["kroj"]["marks"]]
            ax.text(0, 1, f"{el['layer']} · TRAKA {st['poly'][:, 1].max():.0f} x {st['poly'][:, 0].max():.0f} mm · zarezi", va="top", fontsize=10, weight="bold")
            tbl = ax.table(cellText=rows, colLabels=["oznaka", "s na šivaćoj liniji (mm)", "od lijevog ruba trake (mm)"], loc="upper center", bbox=[0, 0.05, 1, 0.9])
            tbl.auto_set_font_size(False); tbl.set_fontsize(7)
            pdf.savefig(fig); plt.close(fig)
            for name in ("LICE", "SPUZVA"):
                tiled_pages(pdf, el, parts[name], page)


# --------------------------------------------------------------------------- nesting
def write_nesting(placements: list, material: str, roll_width: float, length: float, base: str):
    """Slaganje na rolu: DXF 1:1 (rola kao okvir, dijelovi sa šifrom) i PDF pregled (nije 1:1)."""
    doc = _new_doc()
    msp = doc.modelspace()
    doc.layers.add("ROLA", color=8)
    doc.layers.add("DIJELOVI", color=1)
    doc.layers.add("TEKST", color=7)
    msp.add_lwpolyline([(0, 0), (roll_width, 0), (roll_width, length), (0, length)], format="xy", close=True, dxfattribs={"layer": "ROLA"})
    msp.add_text(f"ROLA {material} širina {roll_width:.0f} mm, potrebna duljina {length / 1000:.2f} m", height=20, dxfattribs={"layer": "TEKST"}).set_placement((0, length + 30))
    for p in placements:
        msp.add_lwpolyline(p["poly"].tolist(), format="xy", close=True, dxfattribs={"layer": "DIJELOVI"})
        (x0, y0), (x1, y1) = p["bbox"]
        msp.add_text(f"{p['id']} ({p['rot_deg']}°)", height=min(25, max(8, (y1 - y0) / 6)), dxfattribs={"layer": "TEKST"}).set_placement(
            ((x0 + x1) / 2, (y0 + y1) / 2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    doc.saveas(base + ".dxf")
    with PdfPages(base + ".pdf") as pdf:
        fig = plt.figure(figsize=(8.27, 11.69))
        ax = fig.add_axes([0.08, 0.05, 0.84, 0.88]); ax.set_aspect("equal")
        ax.add_patch(plt.Rectangle((0, 0), roll_width, length, fill=False, lw=1.2))
        for p in placements:
            q = _closed(p["poly"]); ax.plot(q[:, 0], q[:, 1], "k-", lw=0.8)
            ax.fill(q[:, 0], q[:, 1], color="#cfe3f5", alpha=0.6)
            (x0, y0), (x1, y1) = p["bbox"]
            ax.text((x0 + x1) / 2, (y0 + y1) / 2, f"{p['id']}\n{p['rot_deg']}°", ha="center", va="center", fontsize=5)
        ax.set_xlim(-50, roll_width + 50); ax.set_ylim(-50, length + 50)
        ax.set_title(f"Nesting · {material} · rola {roll_width:.0f} mm · duljina {length / 1000:.2f} m (pregled, nije 1:1)", fontsize=9)
        ax.tick_params(labelsize=6); ax.set_xlabel("mm", fontsize=7)
        pdf.savefig(fig); plt.close(fig)
