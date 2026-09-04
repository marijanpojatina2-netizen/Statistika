"""API od kraja do kraja: brodovi, posao, element, fotografija, mjerenje (3 dodira), prihvat, izvoz."""
import os
import tempfile

import numpy as np
import pytest

os.environ["JASTUK_VAR"] = tempfile.mkdtemp(prefix="jastuk_test_")

from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO = os.path.join(ROOT, "fotke", "mala_kupa_stola.jpg")


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        # bez prijave: 401; zadani korisnik radionica/jastuk
        assert c.get("/api/jobs").status_code == 401
        assert c.post("/api/login", json={"username": "radionica", "password": "krivo"}).status_code == 401
        tok = c.post("/api/login", json={"username": "radionica", "password": "jastuk"}).json()["token"]
        c.headers["Authorization"] = "Bearer " + tok
        assert c.get("/api/me").json()["username"] == "radionica"
        yield c


def test_boats_seeded_and_search(client):
    r = client.get("/api/boats?q=bavaria 46").json()
    assert r and r[0]["builder"] == "Bavaria" and r[0]["model"] == "Cruiser 46" and r[0]["priority"] == 1
    assert len(client.get("/api/boats?q=lagoon").json()) == 7
    assert len(client.get("/api/boats").json()) == 50          # limit


def test_full_flow(client):
    boat = client.get("/api/boats?q=bavaria 46").json()[0]
    j = client.post("/api/jobs", json={"boat_model_id": boat["id"], "boat_name": "Test", "customer": "K"}).json()
    jid = j["job"]["id"]
    assert j["boat"]["model"] == "Cruiser 46" and j["elements"] == []

    el = client.post(f"/api/jobs/{jid}/elements", json={"code": "MALA KUPA STOLA", "zone": "salon", "sketch": [[0.3, 0.4], [0.7, 0.4], [0.7, 0.6], [0.3, 0.6]]}).json()
    assert el["status"] == "nacrtan"
    el2 = client.patch(f"/api/elements/{el['id']}", json={"thickness_mm": 80, "kind": "ostalo"}).json()
    assert el2["thickness_mm"] == 80 and el2["sketch"][0] == [0.3, 0.4]

    with open(PHOTO, "rb") as f:
        ph = client.post("/api/photos", files={"file": ("x.jpg", f, "image/jpeg")}).json()
    assert ph["width"] > ph["preview_width"] and ph["preview_url"].startswith("/files/photos/")
    assert client.get(ph["preview_url"]).status_code == 200

    # tri dodira u pikselima originala (kao iz aplikacije): ishodište, točka na osi x, unutar uzorka
    m = client.post(f"/api/elements/{el['id']}/measure", json={
        "photo_id": ph["photo_id"], "origin_px": [375, 1878], "x_axis_px": [975, 1878], "seed_px": [760, 1100]}).json()
    assert m["perimeter_mm"] == pytest.approx(2850, abs=3)
    b = m["bbox_mm"]
    assert (b[1][0] - b[0][0], b[1][1] - b[0][1]) == pytest.approx((493, 1033), abs=2)
    assert m["quality"]["grid_nodes"] > 50 and len(m["outline_px"]) == len(m["outline_mm"])
    assert client.get(m["control_url"]).status_code == 200

    el3 = client.post(f"/api/elements/{el['id']}/accept", json={"measurement_id": m["measurement_id"]}).json()
    assert el3["status"] == "izmjeren" and el3["method"] == "grid" and len(el3["outline_mm"]) == len(m["outline_mm"])

    # ručni obris (pravokutnik, zadan u smjeru kazaljke -> spremi se CCW)
    el4 = client.post(f"/api/jobs/{jid}/elements", json={"code": "KLUPA", "outline_mm": [[0, 0], [0, 500], [1000, 500], [1000, 0]]}).json()
    el4 = client.patch(f"/api/elements/{el4['id']}", json={"outline_mm": [[0, 0], [0, 500], [1000, 500], [1000, 0]]}).json()
    assert el4["status"] == "potvrđen" and el4["method"] == "manual"
    p = np.array(el4["outline_mm"])
    assert 0.5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1]) > 0

    ex = client.post(f"/api/jobs/{jid}/export").json()
    assert ex["n_elements"] == 2
    for f in ex["files"]:
        r = client.get(f["url"])
        assert r.status_code == 200 and len(r.content) > (20 if f["name"].endswith(".csv") else 500), f
    js = client.get(f"/files/jobs/{jid}/konture_mm.json").json()
    assert {x["layer"] for x in js} == {"MALA KUPA STOLA", "KLUPA"}

    jobs = client.get("/api/jobs").json()
    assert jobs[0]["job"]["id"] == jid and jobs[0]["n_elements"] == 2
    assert client.delete(f"/api/jobs/{jid}").json() == {"ok": True}
    assert client.get(f"/api/jobs/{jid}").status_code == 404


def test_measure_errors(client):
    j = client.post("/api/jobs", json={}).json()
    el = client.post(f"/api/jobs/{j['job']['id']}/elements", json={}).json()
    r = client.post(f"/api/elements/{el['id']}/measure", json={"photo_id": "nema", "origin_px": [0, 0], "x_axis_px": [1, 0], "seed_px": [5, 5]})
    assert r.status_code == 404
    assert client.post(f"/api/jobs/{j['job']['id']}/export").status_code == 422
    assert client.patch(f"/api/elements/{el['id']}", json={"outline_mm": [[0, 0], [1, 1]]}).status_code == 422


def test_app_shell(client):
    r = client.get("/")
    assert r.status_code == 200 and "Jastuk" in r.text
    assert client.get("/app.js").status_code == 200 and client.get("/sw.js").status_code == 200


def test_markers_flow(client, tmp_path):
    """Metoda B kroz API: sintetička fotografija s markerima, jedan dodir, ručna korekcija, prihvat, izvoz."""
    from synth_scene import make_scene
    import cv2
    photo, truth, seed_px, Hp, S = make_scene(seed=3)
    f = tmp_path / "markeri.jpg"
    cv2.imwrite(str(f), photo, [cv2.IMWRITE_JPEG_QUALITY, 92])
    j = client.post("/api/jobs", json={"boat_name": "Markeri"}).json()
    el = client.post(f"/api/jobs/{j['job']['id']}/elements", json={"code": "KLUPA L"}).json()
    with open(f, "rb") as fh:
        ph = client.post("/api/photos", files={"file": ("m.jpg", fh, "image/jpeg")}).json()
    r = client.post(f"/api/elements/{el['id']}/measure_markers", json={"photo_id": ph["photo_id"], "seed_px": list(seed_px), "marker_mm": 80})
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["method"] == "markers" and m["quality"]["n_markers"] == 6 and m["quality"]["fit_rms_mm"] < 1.0
    b = m["bbox_mm"]
    (a, bb) = sorted(cv2.minAreaRect(np.array(m["outline_mm"], np.float32))[1])
    assert a == pytest.approx(600, abs=6) and bb == pytest.approx(1200, abs=8)
    assert client.get(m["rect_url"]).status_code == 200 and m["rect_size"][0] > 1000
    assert len(m["markers_rect_px"]) == 6 and len(m["outline_px"]) == len(m["outline_mm"])
    # ručna korekcija: korisnik odsiječe dio -> prihvati uređeni obris
    edited = [[0, 0], [1000, 0], [1000, 500], [0, 500]]
    el2 = client.post(f"/api/elements/{el['id']}/accept", json={"measurement_id": m["measurement_id"], "outline_mm": edited}).json()
    assert el2["status"] == "izmjeren" and el2["method"] == "markers" and len(el2["outline_mm"]) == 4
    me = client.get(f"/api/elements/{el['id']}").json()["measurement"]
    assert me["params"]["edited"] is True and len(me["params"]["outline_auto_mm"]) > 20
    ex = client.post(f"/api/jobs/{j['job']['id']}/export").json()
    assert ex["n_elements"] == 1
    # premalo markera -> 422 s porukom
    blank = tmp_path / "prazno.jpg"
    cv2.imwrite(str(blank), np.full((1200, 900, 3), 180, np.uint8))
    with open(blank, "rb") as fh:
        ph2 = client.post("/api/photos", files={"file": ("p.jpg", fh, "image/jpeg")}).json()
    r = client.post(f"/api/elements/{el['id']}/measure_markers", json={"photo_id": ph2["photo_id"], "seed_px": [450, 600]})
    assert r.status_code == 422 and "markera" in r.json()["detail"]


def test_features_api(client):
    types = client.get("/api/feature_types").json()
    assert {t["type"] for t in types} >= {"zip", "keder", "kopca", "rupa", "gumb", "napomena"}
    j = client.post("/api/jobs", json={"boat_name": "Dodaci"}).json()
    el = client.post(f"/api/jobs/{j['job']['id']}/elements", json={"code": "SJEDALO", "outline_mm": [[0, 0], [1000, 0], [1000, 500], [0, 500]]}).json()
    feats = [{"type": "zip", "s0": 100, "s1": 900, "params": {"sirina": 8}},
             {"type": "kopca", "p": [50, 30]}, {"type": "kopca", "p": [950, 30]},
             {"type": "rupa", "p": [500, 250], "params": {"promjer": 60}}]
    el2 = client.patch(f"/api/elements/{el['id']}", json={"features": feats}).json()
    assert len(el2["features"]) == 4 and el2["features"][1]["params"]["vrsta"] == "druker"   # zadani parametri popunjeni
    assert el2["features"][0]["params"] == {"sirina": 8, "strana": "traka"} and el2["features"][0]["id"] == "f1"
    assert client.patch(f"/api/elements/{el['id']}", json={"features": [{"type": "nepoznato", "p": [0, 0]}]}).status_code == 422
    assert client.patch(f"/api/elements/{el['id']}", json={"features": [{"type": "zip", "s0": 1}]}).status_code == 422
    ex = client.post(f"/api/jobs/{j['job']['id']}/export").json()
    names = {f["name"] for f in ex["files"]}
    assert "dodaci.csv" in names
    csv = client.get(f"/files/jobs/{j['job']['id']}/dodaci.csv").text
    assert "SJEDALO;cif (patentni zatvarač);0.8;m" in csv and "SJEDALO;kopča;2;kom" in csv
    js = client.get(f"/files/jobs/{j['job']['id']}/konture_mm.json").json()
    assert js[0]["dodaci"]["kopca"] == 2 and js[0]["dodaci"]["zip"] == 800


def test_rules_and_kroj_export(client):
    r = client.get("/api/rules").json()
    assert r["seam_mm"] == 10 and r["page"] == "A4"
    r2 = client.put("/api/rules", json={"seam_mm": 12, "page": "A3"}).json()
    assert r2["seam_mm"] == 12 and r2["page"] == "A3" and r2["foam_offset_mm"]["default"] == -5
    assert client.get("/api/rules").json()["seam_mm"] == 12
    j = client.post("/api/jobs", json={"boat_name": "Kroj"}).json()
    client.post(f"/api/jobs/{j['job']['id']}/elements", json={"code": "SJEDALO", "zone": "kokpit", "thickness_mm": 60,
                "outline_mm": [[0, 0], [800, 0], [800, 400], [0, 400]], "features": [{"type": "zip", "s0": 50, "s1": 750}]})
    ex = client.post(f"/api/jobs/{j['job']['id']}/export").json()
    names = [f["name"] for f in ex["files"]]
    assert names[0] == "kroj_1_1_A3.pdf" and "kroj_1_1.dxf" in names and "materijal.csv" in names and ex["page"] == "A3"
    assert ex["materijal"][0]["strip_length_mm"] == 2400 * 0.98 + 24 or ex["materijal"][0]["material"] == "vinil"
    for n in ("kroj_1_1_A3.pdf", "kroj_1_1.dxf", "materijal.csv"):
        resp = client.get(f"/files/jobs/{j['job']['id']}/{n}")
        assert resp.status_code == 200 and len(resp.content) > 100
    csv = client.get(f"/files/jobs/{j['job']['id']}/materijal.csv").text
    assert csv.startswith("element;materijal;") and "SJEDALO;vinil;" in csv
    ex2 = client.post(f"/api/jobs/{j['job']['id']}/export?page=A4").json()
    assert ex2["files"][0]["name"] == "kroj_1_1_A4.pdf"
    client.put("/api/rules", json={"seam_mm": 10, "page": "A4"})


def test_auth_files_and_logout(client):
    from api import auth
    auth.set_user("kolega", "tajna")
    r = client.post("/api/login", json={"username": "kolega", "password": "tajna"}).json()
    assert r["username"] == "kolega"
    j = client.post("/api/jobs", json={"boat_name": "Tko"}).json()
    assert j["job"]["created_by"] == "radionica"
    # datoteke: bez tokena 401, s tokenom u upitu 200 (linkovi iz preglednika)
    hdr = client.headers.pop("Authorization")
    assert client.get("/files/photos/nema.jpg").status_code == 401
    assert client.get("/files/photos/nema.jpg?token=" + hdr[7:]).status_code == 404
    client.headers["Authorization"] = hdr
    assert client.post("/api/logout").json() == {"ok": True}
    assert client.get("/api/jobs").status_code == 401
    tok = client.post("/api/login", json={"username": "radionica", "password": "jastuk"}).json()["token"]
    client.headers["Authorization"] = "Bearer " + tok


def test_export_has_nesting(client):
    j = client.post("/api/jobs", json={"boat_name": "Nest"}).json()
    for i, z in enumerate(("kokpit", "kokpit", "salon")):
        client.post(f"/api/jobs/{j['job']['id']}/elements", json={"code": f"E{i}", "zone": z, "thickness_mm": 50,
                    "outline_mm": [[0, 0], [900, 0], [900, 450], [0, 450]]})
    ex = client.post(f"/api/jobs/{j['job']['id']}/export").json()
    names = [f["name"] for f in ex["files"]]
    assert "nesting_vinil.pdf" in names and "nesting_tkanina.dxf" in names
    role = {r["material"]: r for r in ex["role"]}
    assert role["vinil"]["n_parts"] == 6 and role["vinil"]["length_m"] > 2.5 and role["tkanina"]["n_parts"] == 3
    csv = client.get(f"/files/jobs/{j['job']['id']}/materijal.csv").text
    assert "rola;vinil;1370" in csv
