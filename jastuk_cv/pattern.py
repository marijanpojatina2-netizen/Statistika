"""Krojevi iz obrisa elementa: lice, dno, traka (bočnica), spužva, sa šavom, zarezima i pravilima
radionice. Ulaz je obris gotovog jastuka (mm, y prema gore, CCW), debljina i dodaci.

Pojmovi:
  šivaća linija  = obris lica umanjen za skupljanje navlake (pravilo radionice)
  lice / dno     = šivaća linija + dodatak za šav prema van (dno je zrcalno lice)
  traka          = pravokutnik duljine opsega šivaće linije + 2 šava, visine debljina + 2 šava
  zarezi         = oznake na šivaćoj liniji na istim duljinama luka na licu, dnu i traci:
                   početak, počeci/krajevi uglova, cif, svakih N mm po ravnim dijelovima
  spužva         = izmjereni obris pomaknut prema unutra po pravilu radionice
"""
from __future__ import annotations

import copy

import numpy as np
from shapely.geometry import Polygon

from . import features as FT
from .contour import find_corners, resample_closed, simplify_closed, ensure_ccw, perimeter

DEFAULT_RULES = {
    "seam_mm": 10,                                   # dodatak za šav
    "foam_offset_mm": {"kokpit": -3, "paluba": -3, "default": -5},   # spužva prema izmjerenom prostoru, po zoni
    "cover_shrink_pct": {"vinil": 2.0, "tkanina": 1.0},              # navlaka manja od spužve
    "material_by_zone": {"kokpit": "vinil", "paluba": "vinil", "default": "tkanina"},
    "notch_step_mm": 300,                            # zarezi po ravnim dijelovima
    "notch_len_mm": 6,
    "roll_width_mm": {"vinil": 1370, "tkanina": 1400},
    "gap_mm": 15,
    "page": "A4",                                    # A4 | A3 za PDF 1:1
    "cjenik": {},                                    # vidi quote.DEFAULT_PRICES (prazno = zadane cijene)
    "radionica": {},                                 # naziv, adresa, oib, kontakt, valuta, rok_dana, vrijedi_dana
}
PAGES = {"A4": (210.0, 297.0), "A3": (297.0, 420.0)}


def merge_rules(rules: dict | None) -> dict:
    out = copy.deepcopy(DEFAULT_RULES)
    for k, v in (rules or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k].update(v)
        else:
            out[k] = v
    return out


def by_zone(table: dict, zone: str):
    return table.get(zone, table.get("default"))


def offset(poly: np.ndarray, d: float) -> np.ndarray:
    pg = Polygon(poly).buffer(d, join_style="round", quad_segs=24)
    if pg.is_empty or pg.geom_type != "Polygon":
        pg = max(pg.geoms, key=lambda g: g.area) if hasattr(pg, "geoms") else pg
    ext = np.array(pg.exterior.coords)[:-1]
    return ensure_ccw(simplify_closed(ext, 0.2))


def shrink(poly: np.ndarray, pct: float) -> np.ndarray:
    c = poly.mean(0)
    return c + (poly - c) * (1 - pct / 100.0)


def notch_positions(sew: np.ndarray, features: list, step: float) -> list[tuple[float, str]]:
    """(s, oznaka) na šivaćoj liniji: početak, uglovi, cif, i svakih `step` mm po ravnim dijelovima."""
    L = perimeter(sew)
    marks = [(0.0, "P")]
    corners = find_corners(sew)
    for i, c in enumerate(corners, 1):
        marks.append((c["s_start"] % L, f"U{i}a"))
        marks.append((c["s_end"] % L, f"U{i}b"))
    for f in features or []:
        if f.get("type") == "zip":
            marks.append((f["s0"] % L, "Z1"))
            marks.append((f["s1"] % L, "Z2"))
    # ravni dijelovi: između uzastopnih oznaka duljih od 1.5*step dodaj oznake svakih step
    base = sorted(set(round(m[0], 1) for m in marks))
    extra = []
    for a, b in zip(base, base[1:] + [base[0] + L]):
        n = int((b - a) // step)
        if (b - a) > 1.5 * step:
            for k in range(1, n + 1):
                if b - (a + k * step) > 0.4 * step:
                    extra.append(((a + k * step) % L, "z"))
    marks += extra
    marks.sort(key=lambda m: m[0])
    out = []
    for s, lab in marks:                          # ukloni duplikate bliže od 8 mm
        if out and abs(s - out[-1][0]) < 8:
            continue
        out.append((s, lab))
    return out


def notch_lines(sew: np.ndarray, marks, seam: float, length: float) -> list:
    """Zarez = crta od šivaće linije prema van kroz dodatak za šav (duljina `length`)."""
    lines = []
    for s, lab in marks:
        p, t = FT.point_at_s(sew, s)
        n = np.array([t[1], -t[0]])              # za CCW (y gore) vanjska normala je desno od tangente
        lines.append((p + n * (seam - length), p + n * (seam + 1.0), lab))
    return lines


def make_parts(poly_mm, thickness_mm: float, features: list | None, rules: dict | None, zone: str = "salon",
               code: str = "EL") -> dict:
    R = merge_rules(rules)
    poly = ensure_ccw(np.asarray(poly_mm, float))
    seam = float(R["seam_mm"])
    material = by_zone(R["material_by_zone"], zone)
    shrink_pct = float(R["cover_shrink_pct"].get(material, 0))
    sew = resample_closed(shrink(poly, shrink_pct), 2.0)
    L = perimeter(sew)
    marks = notch_positions(sew, features, float(R["notch_step_mm"]))
    face = offset(sew, seam)
    notches = notch_lines(sew, marks, seam, float(R["notch_len_mm"]))
    parts = []
    bb = lambda q: (q.min(0), q.max(0))
    # ---- LICE
    parts.append(dict(name="LICE", poly=face, sew=sew, notches=notches,
                      texts=[(f"{code} LICE", 30), (f"šav {seam:.0f} mm · {material}", 14)], grain=True, qty=1))
    # ---- DNO (zrcalno)
    M = np.array([-1.0, 1.0])
    parts.append(dict(name="DNO", poly=ensure_ccw(face * M), sew=ensure_ccw(sew * M),
                      notches=[(a * M, b * M, lab) for a, b, lab in notches],
                      texts=[(f"{code} DNO (zrcalno lice)", 30), (f"šav {seam:.0f} mm · {material}", 14)], grain=True, qty=1))
    # ---- TRAKA
    H = float(thickness_mm) + 2 * seam
    strip = np.array([[0, 0], [L + 2 * seam, 0], [L + 2 * seam, H], [0, H]], float)
    snot = []
    for s, lab in marks:
        x = seam + s
        snot.append((np.array([x, 0.0]), np.array([x, float(R["notch_len_mm"])]), lab))
        snot.append((np.array([x, H]), np.array([x, H - float(R["notch_len_mm"])]), lab))
    stexts = [(f"{code} TRAKA {H:.0f} x {L + 2 * seam:.0f} mm (debljina {thickness_mm:.0f} + 2 x šav {seam:.0f}; opseg šivaće linije {L:.0f})", 14)]
    zip_on_strip = [f for f in features or [] if f.get("type") == "zip" and (f.get("params") or {}).get("strana", "traka") == "traka"]
    for f in zip_on_strip:
        stexts.append((f"CIF na traci od {f['s0'] % L + seam:.0f} do {f['s1'] % L + seam:.0f} mm (traka se tu reže po sredini: 2 x {H / 2:.0f} mm + šav)", 12))
    parts.append(dict(name="TRAKA", poly=strip, sew=None, notches=snot, texts=stexts, grain=False, qty=1,
                      zip_ranges=[((f["s0"] % L) + seam, (f["s1"] % L) + seam) for f in zip_on_strip]))
    # ---- SPUŽVA
    foff = float(by_zone(R["foam_offset_mm"], zone))
    foam = offset(poly, foff)
    parts.append(dict(name="SPUZVA", poly=foam, sew=None, notches=[],
                      texts=[(f"{code} SPUŽVA debljina {thickness_mm:.0f} mm", 30), (f"obris {foff:+.0f} mm prema izmjerenom", 14)], grain=False, qty=1))
    # ---- popis materijala
    area = lambda q: float(Polygon(q).area)
    bom = dict(material=material, fabric_m2=round((area(face) * 2 + (L + 2 * seam) * H) / 1e6, 3),
               strip_length_mm=round(L + 2 * seam), strip_height_mm=round(H), foam_m2=round(area(foam) / 1e6, 3),
               foam_thickness_mm=thickness_mm, sew_perimeter_mm=round(L), n_notches=len(marks),
               roll_width_mm=R["roll_width_mm"].get(material))
    return dict(parts=parts, marks=[(round(s, 1), lab) for s, lab in marks], bom=bom, rules=R, material=material)
