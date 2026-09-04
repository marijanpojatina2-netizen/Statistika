"""A4 PDF s ArUco markerima za mjerenje (metoda B) i šahovnica za kalibraciju kamere.

    python3 tools/make_markers.py            # -> markeri/aruco_5x5_80mm_a4.pdf, markeri/kalibracija_sahovnica_a4.pdf

Markeri: rječnik DICT_5X5_50, ID 0..11, stranica 80 mm, kartica 100 x 100 mm (bijeli rub 10 mm),
4 po stranici, 3 stranice. Ispis u stvarnoj veličini (100 %), mat laminat, po mogućnosti zalijepiti
na krutu podlogu (1-2 mm) s magnetom ili gumom na poleđini.
"""
from __future__ import annotations

import os

import cv2
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt          # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "markeri")
DICT = cv2.aruco.DICT_5X5_50
DICT_NAME = "DICT_5X5_50"
MARKER_MM = 80.0
CARD_MM = 100.0
N_MARKERS = 12
A4 = (210.0, 297.0)


def page(pdf):
    fig = plt.figure(figsize=(A4[0] / 25.4, A4[1] / 25.4))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, A4[0]); ax.set_ylim(A4[1], 0); ax.axis("off")
    return fig, ax


def draw_card(ax, x, y, marker_id, dictionary):
    img = cv2.aruco.generateImageMarker(dictionary, marker_id, 7 * 40)   # 5 bita + rub = 7 modula
    q = (CARD_MM - MARKER_MM) / 2
    ax.imshow(img, cmap="gray", vmin=0, vmax=255, extent=[x + q, x + q + MARKER_MM, y + q + MARKER_MM, y + q],
              interpolation="nearest", zorder=2)
    ax.add_patch(plt.Rectangle((x, y), CARD_MM, CARD_MM, fill=False, lw=0.4, ls=(0, (3, 3)), ec="#888", zorder=3))
    ax.text(x + CARD_MM / 2, y + CARD_MM - 2.5, f"M{marker_id:02d}  ·  {MARKER_MM:.0f} mm  ·  {DICT_NAME}",
            ha="center", va="center", fontsize=6.5, color="#444")
    ax.text(x + 2.5, y + 5, "▲", ha="left", va="center", fontsize=6, color="#444")   # orijentacija kartice


def markers_pdf(path):
    d = cv2.aruco.getPredefinedDictionary(DICT)
    per_page = 4
    with PdfPages(path) as pdf:
        for p0 in range(0, N_MARKERS, per_page):
            fig, ax = page(pdf)
            ax.text(A4[0] / 2, 12, "Jastuk · ArUco markeri za mjerenje s fotografije", ha="center", va="center", fontsize=11, weight="bold")
            ax.text(A4[0] / 2, 19, "Ispiši u STVARNOJ VELIČINI (100 %, bez 'prilagodi stranici'). Kontrola: crta dolje mora biti točno 100 mm, "
                    "marker 80 mm.", ha="center", va="center", fontsize=7)
            ax.text(A4[0] / 2, 24.5, "Izreži po crtkanoj liniji, mat laminat, zalijepi na krutu podlogu. Bijeli rub oko markera ne rezati.",
                    ha="center", va="center", fontsize=7, color="#444")
            ids = list(range(p0, min(p0 + per_page, N_MARKERS)))
            x0 = (A4[0] - 2 * CARD_MM) / 2
            y0 = 32.0
            for k, mid in enumerate(ids):
                draw_card(ax, x0 + (k % 2) * CARD_MM, y0 + (k // 2) * CARD_MM, mid, d)
            # kontrolna crta 100 mm i kvadrat 20 mm
            yc = y0 + 2 * CARD_MM + 14
            ax.plot([x0, x0 + 100], [yc, yc], color="k", lw=1.0)
            for xx in (x0, x0 + 100):
                ax.plot([xx, xx], [yc - 3, yc + 3], color="k", lw=1.0)
            ax.text(x0 + 50, yc - 5, "100 mm", ha="center", va="center", fontsize=7)
            ax.add_patch(plt.Rectangle((x0 + 120, yc - 10), 20, 20, fill=False, lw=0.8, ec="k"))
            ax.text(x0 + 130, yc + 14, "20 mm", ha="center", va="center", fontsize=7)
            ax.text(A4[0] - 12, A4[1] - 8, f"stranica {p0 // per_page + 1}/{(N_MARKERS + per_page - 1) // per_page}",
                    ha="right", va="center", fontsize=6, color="#888")
            pdf.savefig(fig, dpi=600)
            plt.close(fig)


def chessboard_pdf(path, square_mm=25.0, cols=7, rows=10):
    """Šahovnica cols x rows polja (unutarnjih kutova (cols-1) x (rows-1)) za kalibraciju kamere."""
    with PdfPages(path) as pdf:
        fig, ax = page(pdf)
        w, h = cols * square_mm, rows * square_mm
        x0, y0 = (A4[0] - w) / 2, (A4[1] - h) / 2 + 6
        for r in range(rows):
            for c in range(cols):
                if (r + c) % 2 == 0:
                    ax.add_patch(plt.Rectangle((x0 + c * square_mm, y0 + r * square_mm), square_mm, square_mm, color="k", lw=0))
        ax.text(A4[0] / 2, 10, f"Jastuk · šahovnica za kalibraciju kamere  ({cols}×{rows} polja po {square_mm:.0f} mm, "
                f"unutarnjih kutova {cols-1}×{rows-1})", ha="center", va="center", fontsize=9, weight="bold")
        ax.text(A4[0] / 2, 16, "Ispiši u stvarnoj veličini, zalijepi ravno na krutu ploču. Slikaj je 15-20 puta iz raznih kutova i udaljenosti.",
                ha="center", va="center", fontsize=7)
        pdf.savefig(fig, dpi=600)
        plt.close(fig)


def main():
    os.makedirs(OUT, exist_ok=True)
    markers_pdf(os.path.join(OUT, "aruco_5x5_80mm_a4.pdf"))
    chessboard_pdf(os.path.join(OUT, "kalibracija_sahovnica_a4.pdf"))
    print("->", OUT)


if __name__ == "__main__":
    main()
