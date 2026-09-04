"""Dodaci (cif, keder, kopče, rupe...): geometrija po obrisu, popis materijala, izlaz u DXF/PDF."""
import os
import tempfile

import ezdxf
import numpy as np
import pytest

from jastuk_cv import features as FT
from jastuk_cv import outputs


def rect(w=1000.0, h=500.0):
    return np.array([[0, 0], [w, 0], [w, h], [0, h]], float)


def test_point_at_s_and_arc():
    p = rect()
    assert FT.cumlen(p)[-1] == pytest.approx(3000)
    q, t = FT.point_at_s(p, 250)
    assert np.allclose(q, [250, 0]) and np.allclose(t, [1, 0])
    q, t = FT.point_at_s(p, 1200)                     # desna stranica, 200 mm gore
    assert np.allclose(q, [1000, 200]) and np.allclose(t, [0, 1])
    a = FT.arc(p, 900, 1300)                          # preko ugla
    assert np.allclose(a[0], [900, 0]) and np.allclose(a[-1], [1000, 300])
    assert abs(FT.cumlen(a[:-1])[-2] - 400) < 1.0 or len(a) > 50
    a2 = FT.arc(p, 2900, 100)                          # preko početka (ciklički)
    assert np.allclose(a2[0], [0, 100]) and np.allclose(a2[-1], [100, 0])
    assert FT.edge_length(p, {"s0": 2900, "s1": 100}) == pytest.approx(200)
    assert FT.edge_length(p, {"s0": 0, "s1": 0}) == pytest.approx(3000)   # cijeli obris


def test_project_s():
    p = rect()
    assert FT.project_s(p, [400, -30]) == pytest.approx(400)
    assert FT.project_s(p, [1040, 100]) == pytest.approx(1100)
    assert FT.project_s(p, [500, 520]) == pytest.approx(2000)


def test_bom_and_labels():
    p = rect()
    feats = [{"type": "zip", "s0": 100, "s1": 900, "params": {"sirina": 5}},
             {"type": "keder", "s0": 0, "s1": 0, "params": {}},
             {"type": "kopca", "p": [100, 30], "params": {"vrsta": "tenax"}},
             {"type": "kopca", "p": [900, 30], "params": {"vrsta": "tenax"}},
             {"type": "rupa", "p": [500, 250], "params": {"promjer": 40}}]
    b = FT.bom(p, feats)
    assert b["zip"] == pytest.approx(800) and b["keder"] == pytest.approx(3000) and b["kopca"] == 2 and b["rupa"] == 1
    assert FT.label(feats[0]) == "CIF 5 mm (traka)" and FT.label(feats[2]) == "KOPČA tenax" and FT.label(feats[4]) == "RUPA Ø40"


def test_outputs_with_features():
    p = rect()
    feats = [{"type": "zip", "s0": 100, "s1": 900, "params": {"sirina": 5, "strana": "traka"}},
             {"type": "kopca", "p": [100, 30], "params": {"vrsta": "druker"}},
             {"type": "napomena", "p": [500, 250], "params": {"tekst": "LICE GORE"}}]
    r = dict(key="k", layer="KLUPA", file="", poly_mm=p, corners=[], perimeter_mm=3000.0,
             bbox_mm=([0, 0], [1000, 500]), features=feats)
    d = tempfile.mkdtemp()
    outputs.write_elements_1_1([r], os.path.join(d, "e"))
    outputs.write_strip_offset([r], os.path.join(d, "t"))
    doc = ezdxf.readfile(os.path.join(d, "e.dxf"))
    layers = {l.dxf.name for l in doc.layers}
    assert {"KLUPA ZIP", "KLUPA KOPCA", "KLUPA NAPOMENA"} <= layers
    texts = [t.dxf.text for t in doc.modelspace().query("TEXT")]
    assert any("CIF 5 mm" in t and "L=800" in t for t in texts) and "LICE GORE" in texts
    marks = outputs.strip_marks(r)
    assert any(m[2] == "feat" and m[0] == 100 for m in marks) and any(m[2] == "feat" and m[0] == 900 for m in marks)
    rows = outputs.features_table([r])
    assert ("KLUPA", "cif (patentni zatvarač)", 0.8, "m") in rows and ("KLUPA", "kopča", 1, "kom") in rows
    assert os.path.getsize(os.path.join(d, "e.pdf")) > 1000 and os.path.getsize(os.path.join(d, "t.pdf")) > 1000
