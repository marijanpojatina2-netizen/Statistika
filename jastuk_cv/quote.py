"""Ponuda iz popisa materijala: cjenik u pravilima radionice (EUR), rad po elementu, marža, PDV.

    q = quote(elements, roles, rules, discount_pct=0)
    write_quote_pdf(q, job_info, rules, path)

elements: [dict(layer, kind, bom (iz pattern.make_parts), dodaci (iz features.bom))]
roles:    [dict(material, roll_width_mm, length_m)]  (iz nestinga)
"""
from __future__ import annotations

from datetime import date

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                     # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402

from . import features as FT                        # noqa: E402

DEFAULT_PRICES = {
    "tkanina_eur_m": {"vinil": 42.0, "tkanina": 34.0},      # po dužnom metru role
    "spuzva_eur_m3": 260.0,                                  # HR pjena
    "rad_eur_element": {"sjedalo": 45.0, "naslon": 40.0, "madrac": 60.0, "lezaj": 50.0, "ostalo": 40.0},
    "dodaci_eur": {"zip": 3.5, "keder": 1.8, "cicak": 2.2,   # po metru
                   "kopca": 2.5, "rupa": 4.0, "rupica": 1.2, "gumb": 1.5, "vezica": 2.0, "napomena": 0.0},   # po komadu
    "marza_pct": 20.0,
    "pdv_pct": 25.0,
}
DEFAULT_WORKSHOP = {"naziv": "Radionica", "adresa": "", "oib": "", "kontakt": "", "valuta": "EUR", "rok_dana": 14, "vrijedi_dana": 30}


def prices(rules: dict) -> dict:
    p = {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULT_PRICES.items()}
    for k, v in (rules.get("cjenik") or {}).items():
        if isinstance(v, dict) and isinstance(p.get(k), dict):
            p[k].update(v)
        else:
            p[k] = v
    return p


def workshop(rules: dict) -> dict:
    return {**DEFAULT_WORKSHOP, **(rules.get("radionica") or {})}


def quote(elements: list, roles: list, rules: dict, discount_pct: float = 0.0) -> dict:
    P = prices(rules)
    rows, mat_total, rad_total, dod_total = [], 0.0, 0.0, 0.0
    # tkanina: po roli (nesting) ako postoji, inače iz m² elemenata s 30 % otpada
    fabric_cost = {}
    for r in roles:
        if r.get("length_m"):
            fabric_cost[r["material"]] = round(r["length_m"] * P["tkanina_eur_m"].get(r["material"], 40.0), 2)
    for e in elements:
        b = e["bom"]
        foam = round(b["foam_m2"] * b["foam_thickness_mm"] / 1000.0 * P["spuzva_eur_m3"], 2)
        rad = float(P["rad_eur_element"].get(e.get("kind") or "ostalo", P["rad_eur_element"]["ostalo"]))
        dod = 0.0
        for typ, v in (e.get("dodaci") or {}).items():
            unit = float(P["dodaci_eur"].get(typ, 0.0))
            dod += (v / 1000.0 if FT.TYPES[typ][1] == "edge" else v) * unit
        dod = round(dod, 2)
        fab = None
        if b["material"] not in fabric_cost:
            fab = round(b["fabric_m2"] * 1.3 / (b["roll_width_mm"] / 1000.0) * P["tkanina_eur_m"].get(b["material"], 40.0), 2)
        rows.append(dict(element=e["layer"], kind=e.get("kind", ""), material=b["material"], fabric_m2=b["fabric_m2"],
                         foam=f"{b['foam_m2']} m² × {b['foam_thickness_mm']} mm", foam_eur=foam, rad_eur=rad, dodaci_eur=dod,
                         fabric_eur=fab, total=round(foam + rad + dod + (fab or 0.0), 2)))
        mat_total += foam + (fab or 0.0)
        rad_total += rad
        dod_total += dod
    fabric_total = round(sum(fabric_cost.values()), 2)
    materijal = round(mat_total + fabric_total, 2)
    osnova = round(materijal + rad_total + dod_total, 2)
    marza = round(osnova * P["marza_pct"] / 100.0, 2)
    popust = round((osnova + marza) * discount_pct / 100.0, 2)
    bez_pdv = round(osnova + marza - popust, 2)
    pdv = round(bez_pdv * P["pdv_pct"] / 100.0, 2)
    return dict(rows=rows, fabric_by_roll=fabric_cost, roles=roles, materijal_eur=materijal, rad_eur=round(rad_total, 2),
                dodaci_eur=round(dod_total, 2), osnova_eur=osnova, marza_pct=P["marza_pct"], marza_eur=marza,
                popust_pct=discount_pct, popust_eur=popust, bez_pdv_eur=bez_pdv, pdv_pct=P["pdv_pct"], pdv_eur=pdv,
                ukupno_eur=round(bez_pdv + pdv, 2), valuta=workshop(rules)["valuta"])


def write_quote_pdf(q: dict, job: dict, rules: dict, path: str):
    W = workshop(rules)
    cur = q["valuta"]
    with PdfPages(path) as pdf:
        fig = plt.figure(figsize=(8.27, 11.69))
        ax = fig.add_axes([0.07, 0.04, 0.86, 0.92]); ax.axis("off")
        y = 1.0
        def line(txt, dy=0.022, size=9, weight="normal"):
            nonlocal y
            ax.text(0, y, txt, va="top", fontsize=size, weight=weight, family="DejaVu Sans")
            y -= dy
        line(W["naziv"], 0.03, 14, "bold")
        for k in ("adresa", "oib", "kontakt"):
            if W.get(k):
                line(f"{k.upper() if k == 'oib' else k.capitalize()}: {W[k]}", 0.02, 8)
        y -= 0.01
        line(f"PONUDA br. {job.get('id', '')}/{date.today().year}   ·   datum {date.today().strftime('%d.%m.%Y.')}", 0.028, 12, "bold")
        line(f"Kupac: {job.get('customer') or '-'}    Brod: {job.get('boat_name') or '-'} ({job.get('boat') or 'model nepoznat'})    Marina: {job.get('marina') or '-'}", 0.03, 9)
        cols = ["element", "tip", "materijal", "tkanina m²", "spužva", "spužva €", "rad €", "dodaci €", "ukupno €"]
        cells = [[r["element"], r["kind"], r["material"], f"{r['fabric_m2']:.2f}", r["foam"], f"{r['foam_eur']:.2f}", f"{r['rad_eur']:.2f}", f"{r['dodaci_eur']:.2f}", f"{r['total']:.2f}"] for r in q["rows"]]
        h = 0.028 * (len(cells) + 1)
        tbl = ax.table(cellText=cells, colLabels=cols, loc="upper left", bbox=[0, y - h, 1, h], colWidths=[0.2, 0.08, 0.09, 0.09, 0.16, 0.09, 0.08, 0.09, 0.1])
        tbl.auto_set_font_size(False); tbl.set_fontsize(7)
        y -= h + 0.03
        for r in q["roles"]:
            if r.get("length_m"):
                line(f"Tkanina {r['material']}: rola {r['roll_width_mm']} mm × {r['length_m']} m  =  {q['fabric_by_roll'].get(r['material'], 0):.2f} {cur}", 0.02, 9)
        y -= 0.01
        rows2 = [("Materijal (tkanina, spužva)", q["materijal_eur"]), ("Rad", q["rad_eur"]), ("Dodaci (cif, keder, kopče…)", q["dodaci_eur"]),
                 (f"Marža {q['marza_pct']:.0f} %", q["marza_eur"])]
        if q["popust_eur"]:
            rows2.append((f"Popust {q['popust_pct']:.0f} %", -q["popust_eur"]))
        rows2 += [("Ukupno bez PDV-a", q["bez_pdv_eur"]), (f"PDV {q['pdv_pct']:.0f} %", q["pdv_eur"]), ("UKUPNO", q["ukupno_eur"])]
        for lab, val in rows2:
            bold = lab.startswith("UKUPNO") or lab.startswith("Ukupno")
            ax.text(0.55, y, lab, va="top", fontsize=9 if not bold else 10, weight="bold" if bold else "normal")
            ax.text(1.0, y, f"{val:,.2f} {cur}".replace(",", "X").replace(".", ",").replace("X", "."), va="top", ha="right", fontsize=9 if not bold else 10, weight="bold" if bold else "normal")
            y -= 0.024
        y -= 0.02
        line(f"Rok izrade: {W['rok_dana']} dana od potvrde. Ponuda vrijedi {W['vrijedi_dana']} dana. Mjere i krojevi prema mjerenju na brodu; "
             f"eventualne razlike u materijalu po stvarnom utrošku.", 0.02, 7)
        line("Napomena: cijene su iz cjenika radionice u aplikaciji Jastuk; tkanina se obračunava po dužnom metru role prema slaganju krojeva.", 0.02, 7)
        pdf.savefig(fig); plt.close(fig)
