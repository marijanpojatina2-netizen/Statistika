"""Krojevi: šivaća linija, šav, zarezi na licu/dnu/traci na istim duljinama luka, spužva, DXF i PDF 1:1."""
import os
import tempfile

import ezdxf
import numpy as np
import pytest

from jastuk_cv import pattern as PT
from jastuk_cv import kroj_out
from jastuk_cv.contour import perimeter


def rect(w=1000.0, h=500.0):
    return np.array([[0, 0], [w, 0], [w, h], [0, h]], float)


def test_rules_merge():
    r = PT.merge_rules({"seam_mm": 12, "foam_offset_mm": {"kokpit": -2}})
    assert r["seam_mm"] == 12 and r["foam_offset_mm"]["kokpit"] == -2 and r["foam_offset_mm"]["default"] == -5
    assert PT.by_zone(r["material_by_zone"], "kokpit") == "vinil" and PT.by_zone(r["material_by_zone"], "salon") == "tkanina"


def test_parts_geometry_rect():
    feats = [{"type": "zip", "s0": 100, "s1": 900, "params": {"strana": "traka"}}]
    k = PT.make_parts(rect(), 80, feats, {"cover_shrink_pct": {"vinil": 0, "tkanina": 0}}, zone="kokpit", code="T")
    names = [p["name"] for p in k["parts"]]
    assert names == ["LICE", "DNO", "TRAKA", "SPUZVA"]
    face, dno, strip, foam = k["parts"]
    # lice = obris + 10 mm šava: gabarit 1020 x 520 (zaobljeni uglovi)
    (x0, y0), (x1, y1) = face["poly"].min(0), face["poly"].max(0)
    assert (x1 - x0, y1 - y0) == pytest.approx((1020, 520), abs=0.5)
    # dno je zrcalno lice
    assert dno["poly"][:, 0].max() == pytest.approx(-x0, abs=0.5)
    # traka: duljina = opseg šivaće linije (3000, bez skupljanja) + 2 šava, visina 80 + 20
    assert strip["poly"][:, 0].max() == pytest.approx(3020, abs=1) and strip["poly"][:, 1].max() == pytest.approx(100)
    # spužva u kokpitu: -3 mm -> 994 x 494
    (fx0, fy0), (fx1, fy1) = foam["poly"].min(0), foam["poly"].max(0)
    assert (fx1 - fx0, fy1 - fy0) == pytest.approx((994, 494), abs=0.5)
    # zarezi: početak, 4 ugla x 2, cif x 2, i po ravnim dijelovima svakih 300
    labs = [lab for s, lab in k["marks"]]
    assert "P" in labs and "Z1" in labs and "Z2" in labs and labs.count("z") >= 4
    assert sum(1 for l in labs if l.startswith("U")) == 8
    # isti s na licu i traci: traka ima 2 zareza po oznaci (gore i dolje) na x = s + šav
    strip_x = sorted(set(round(a[0], 1) for a, b, lab in strip["notches"]))
    assert strip_x == sorted(set(round(s + 10, 1) for s, lab in k["marks"]))
    assert len(face["notches"]) == len(k["marks"])
    # zarez na licu ide od šivaće linije prema van kroz šav
    a, b, lab = face["notches"][0]
    assert lab == "P" and np.hypot(*(b - a)) == pytest.approx(7, abs=0.1)
    assert k["bom"]["material"] == "vinil" and k["bom"]["strip_length_mm"] == 3020 and k["bom"]["fabric_m2"] > 1.0
    assert strip["zip_ranges"] == [(110, 910)]


def test_shrink_applied_for_fabric():
    k = PT.make_parts(rect(), 80, [], None, zone="salon", code="S")
    assert k["material"] == "tkanina"
    assert k["bom"]["sew_perimeter_mm"] == pytest.approx(3000 * 0.99, abs=2)


def test_dxf_and_pdf_outputs():
    k = PT.make_parts(rect(), 60, [{"type": "zip", "s0": 50, "s1": 950, "params": {"strana": "traka"}}], None, zone="kokpit", code="KLUPA")
    els = [dict(layer="KLUPA", kroj=k)]
    d = tempfile.mkdtemp()
    kroj_out.write_dxf(els, os.path.join(d, "k.dxf"))
    doc = ezdxf.readfile(os.path.join(d, "k.dxf"))
    layers = {l.dxf.name for l in doc.layers}
    assert {"KLUPA LICE", "KLUPA DNO", "KLUPA TRAKA", "KLUPA SPUZVA", "KLUPA ZAREZI", "KLUPA TEKST"} <= layers
    polys = [e for e in doc.modelspace().query("LWPOLYLINE") if e.dxf.layer == "KLUPA TRAKA"]
    assert len(polys) == 1
    kroj_out.write_pdf(els, os.path.join(d, "k_A4.pdf"), page="A4")
    pymupdf = pytest.importorskip("pymupdf")
    pdf = pymupdf.open(os.path.join(d, "k_A4.pdf"))
    # naslovna + pregled + tablica zareza + lice (1050x550 s marginom, korak stranice 180x267 -> 6x3) + spužva (1024x524 -> 6x2)
    assert len(pdf) == 3 + 18 + 12
    assert pdf[0].rect.width == pytest.approx(841.9, abs=1)     # naslovna ležeća
    assert pdf[3].rect.width == pytest.approx(595.3, abs=1)     # A4 uspravno
    kroj_out.write_pdf(els, os.path.join(d, "k_A3.pdf"), page="A3")
    assert len(pymupdf.open(os.path.join(d, "k_A3.pdf"))) < len(pdf)
