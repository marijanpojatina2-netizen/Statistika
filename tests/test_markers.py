"""Metoda B (markeri): prilagodba ravnine, ispravljanje, segmentacija na sintetičkoj sceni s poznatom
istinom, plus provjera da su markeri u PDF-u za tisak detektabilni i točne veličine."""
import os

import cv2
import numpy as np
import pytest

from jastuk_cv.markers import fit_plane, rectify_plane, segment_seed, markers_mask, detect_markers
from jastuk_cv.measure import finish_polyline
from synth_scene import make_scene

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def scene():
    return make_scene(seed=0)


def truth_in_plane(plane, truth, Hp, S):
    return plane.img_to_mm(cv2.perspectiveTransform((truth * S).reshape(-1, 1, 2), Hp).reshape(-1, 2))


def test_plane_fit_scale_and_residual(scene):
    photo, truth, seed_px, Hp, S = scene
    pl = fit_plane(photo, 80.0)
    assert len(pl.ids) == 6 and pl.rms_mm < 0.6
    t = truth_in_plane(pl, truth, Hp, S)
    per_true = np.hypot(*(truth[1:] - truth[:-1]).T).sum()
    per_meas = np.hypot(*(t[1:] - t[:-1]).T).sum()
    assert abs(per_meas / per_true - 1) < 0.003            # mjerilo unutar 0.3 %
    # udaljenost dviju udaljenih točaka istine (dijagonala ~1340 mm) unutar 6 mm
    i, j = 0, len(truth) // 2
    assert abs(np.hypot(*(t[i] - t[j])) - np.hypot(*(truth[i] - truth[j]))) < 6


def test_fit_needs_two_markers():
    with pytest.raises(RuntimeError):
        fit_plane(np.full((800, 800, 3), 200, np.uint8), 80.0)


def test_segmentation_edge_accuracy(scene):
    photo, truth, seed_px, Hp, S = scene
    pl = fit_plane(photo, 80.0)
    rect, origin = rectify_plane(photo, pl)
    assert rect.shape[0] <= 3700 and rect.shape[1] <= 3700
    seed_rect = pl.img_to_mm(seed_px)[0] - origin
    poly_px, mask = segment_seed(rect, seed_rect, exclude_mask=markers_mask(rect, pl, origin))
    p, corners = finish_polyline(poly_px + origin, sigma=4.0)
    t = truth_in_plane(pl, truth, Hp, S)
    signed = np.array([cv2.pointPolygonTest(t.astype(np.float32), (float(x), float(y)), True) for x, y in p])
    assert abs(signed.mean()) < 3.0                        # sustavna pristranost ruba
    assert np.percentile(np.abs(signed), 95) < 5.0         # 95 % ruba unutar 5 mm
    assert 4 <= len(corners) <= 5
    (a, b) = sorted(cv2.minAreaRect(p.astype(np.float32))[1])
    assert a == pytest.approx(600, abs=8) and b == pytest.approx(1200, abs=10)


def test_segmentation_excludes_markers(scene):
    """Dodir na markeru (bijela kartica) ne smije dati konturu kartice: kartice su isključene."""
    photo, truth, seed_px, Hp, S = scene
    pl = fit_plane(photo, 80.0)
    rect, origin = rectify_plane(photo, pl)
    excl = markers_mask(rect, pl, origin)
    assert excl.max() == 255 and 6 * 90 ** 2 < (excl > 0).sum() < 6 * 140 ** 2


def test_marker_pdf_prints_true_size():
    pymupdf = pytest.importorskip("pymupdf")
    doc = pymupdf.open(os.path.join(ROOT, "markeri", "aruco_5x5_80mm_a4.pdf"))
    assert len(doc) == 3
    dpi = 200
    seen = []
    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[..., :3][..., ::-1].copy()
        ids, corners = detect_markers(img)
        seen += ids.tolist()
        for c in corners:
            side = np.mean([np.hypot(*(c[(k + 1) % 4] - c[k])) for k in range(4)])
            assert side == pytest.approx(80 / 25.4 * dpi, rel=0.005)
    assert sorted(seen) == list(range(12))
