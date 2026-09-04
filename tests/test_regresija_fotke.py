"""Regresija na 4 stvarne fotografije: novi paket mora dati iste konture kao commitani
izlaz/konture_mm.json (granica 0.5 mm po točki). Traje ~10 s."""
import json
import os

import cv2
import numpy as np
import pytest

from jastuk_cv import measure_grid, estimate_px_per_cm
from jastuk_cv.cli import load_job

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOB = os.path.join(ROOT, "fotke", "elementi.json")
REF = os.path.join(ROOT, "izlaz", "konture_mm.json")

ELEMS = load_job(JOB)
REFS = {r["layer"]: r for r in json.load(open(REF, encoding="utf-8"))}


def max_dist(a, b):
    """Najveća udaljenost točke iz a do najbliže točke iz b."""
    return max(np.min(np.hypot(*(b - p).T)) for p in a)


@pytest.fixture(scope="module")
def images():
    return {e["key"]: cv2.imread(e["file"]) for e in ELEMS}


@pytest.mark.parametrize("e", ELEMS, ids=[e["key"] for e in ELEMS])
def test_isti_rezultat_kao_prije(e, images):
    m = measure_grid(images[e["key"]], e["origin_px"], xdir=e["xdir"], ydir=e["ydir"],
                     px_per_cm=e["px_per_cm"], seed_cm=e["seed_cm"], square_corner_cm=e.get("square_corner_cm"))
    ref = REFS[e["layer"]]
    rp = np.array(ref["poly_mm"])
    assert max_dist(m.poly_mm, rp) < 0.5
    assert max_dist(rp, m.poly_mm) < 0.5
    assert m.perimeter_mm == pytest.approx(ref["perimeter_mm"], abs=1.0)
    assert len(m.corners) == len(ref["corners"])
    assert m.grid_nodes >= 50 and m.homography_rms_px < 3.0


@pytest.mark.parametrize("e", ELEMS, ids=[e["key"] for e in ELEMS])
def test_procjena_px_per_cm(e, images):
    est = estimate_px_per_cm(images[e["key"]])
    assert est == pytest.approx(e["px_per_cm"], rel=0.15)


def test_api_dodirom_bez_rucnih_parametara(images):
    """Kao iz aplikacije: ishodište + točka na osi x + dodir u uzorku (pikseli), bez px/cm."""
    e = ELEMS[1]                                                  # mala_kupa_stola
    img = images[e["key"]]
    o = np.array(e["origin_px"], float)
    x_axis = o + 600 * np.array(e["xdir"], float)
    # sjeme: cm -> px preko referentne homografije iz mjerenja s ručnim parametrima
    m0 = measure_grid(img, e["origin_px"], xdir=e["xdir"], ydir=e["ydir"], px_per_cm=e["px_per_cm"], seed_cm=e["seed_cm"])
    seed_px = m0.grid.cm_to_px(np.array([e["seed_cm"]], float))[0]
    m = measure_grid(img, e["origin_px"], x_axis_px=x_axis, seed_px=seed_px)
    assert max_dist(m.poly_mm, m0.poly_mm) < 0.5
    assert m.px_per_cm == pytest.approx(e["px_per_cm"], rel=0.15)
    d = m.to_dict()
    assert set(d) >= {"poly_mm", "perimeter_mm", "bbox_mm", "corners", "quality"}
    imgs = m.control_images(img)
    assert imgs["rectified"].ndim == 3 and imgs["detection"].shape == img.shape
