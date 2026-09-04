import os
import tempfile

import pytest

from jastuk_cv import quote as Q


def elems():
    return [dict(layer="SJEDALO", kind="sjedalo", bom=dict(material="vinil", fabric_m2=1.2, foam_m2=0.5, foam_thickness_mm=50, roll_width_mm=1370),
                 dodaci={"zip": 800.0, "kopca": 2}),
            dict(layer="MADRAC", kind="madrac", bom=dict(material="tkanina", fabric_m2=4.0, foam_m2=1.9, foam_thickness_mm=100, roll_width_mm=1400), dodaci={})]


def test_quote_math():
    rules = {"cjenik": {"marza_pct": 10, "pdv_pct": 25, "tkanina_eur_m": {"vinil": 40}}}
    roles = [dict(material="vinil", roll_width_mm=1370, length_m=1.5)]      # tkanina samo za vinil iz nestinga
    q = Q.quote(elems(), roles, rules)
    r = {x["element"]: x for x in q["rows"]}
    assert r["SJEDALO"]["foam_eur"] == pytest.approx(0.5 * 0.05 * 260, abs=0.01)
    assert r["SJEDALO"]["dodaci_eur"] == pytest.approx(0.8 * 3.5 + 2 * 2.5, abs=0.01)
    assert r["SJEDALO"]["rad_eur"] == 45 and r["SJEDALO"]["fabric_eur"] is None
    assert q["fabric_by_roll"] == {"vinil": 60.0}
    # madrac: tkanina bez nestinga -> iz m² s 30 % otpada
    assert r["MADRAC"]["fabric_eur"] == pytest.approx(4.0 * 1.3 / 1.4 * 34, abs=0.01)
    assert q["marza_pct"] == 10 and q["ukupno_eur"] == pytest.approx(q["bez_pdv_eur"] * 1.25, abs=0.02)
    q2 = Q.quote(elems(), roles, rules, discount_pct=10)
    assert q2["popust_eur"] > 0 and q2["ukupno_eur"] < q["ukupno_eur"]


def test_quote_pdf():
    q = Q.quote(elems(), [], {})
    d = tempfile.mkdtemp()
    Q.write_quote_pdf(q, dict(id=7, customer="Kupac d.o.o.", boat_name="Morska vila", boat="Lagoon 42", marina="ACI"), {"radionica": {"naziv": "Tapetarija Test", "oib": "123"}}, os.path.join(d, "p.pdf"))
    assert os.path.getsize(os.path.join(d, "p.pdf")) > 2000
