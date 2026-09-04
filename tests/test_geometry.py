"""Jedinični testovi geometrije na sintetičkim oblicima (bez fotografija)."""
import numpy as np
import pytest

from jastuk_cv.contour import resample_closed, smooth_closed, simplify_closed, ensure_ccw, perimeter, find_corners
from jastuk_cv.measure import axes_from_points, finish_polyline, square_corner


def rect(w, h, x0=0.0, y0=0.0):
    return np.array([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], float)


def rounded_rect(w, h, r, n=30):
    pts = []
    for cx, cy, a0 in ((w - r, h - r, 0), (r, h - r, 90), (r, r, 180), (w - r, r, 270)):
        for a in np.linspace(a0, a0 + 90, n, endpoint=False):
            pts.append((cx + r * np.cos(np.radians(a)), cy + r * np.sin(np.radians(a))))
    return np.array(pts)


def test_perimeter_and_ccw():
    p = rect(1000, 500)
    assert perimeter(p) == pytest.approx(3000)
    assert np.array_equal(ensure_ccw(p), p)
    assert np.array_equal(ensure_ccw(p[::-1]), p[::-1][::-1])
    assert perimeter(ensure_ccw(p[::-1])) == pytest.approx(3000)


def test_resample_step():
    p = resample_closed(rect(1000, 500), 1.0)
    assert len(p) == 3000
    seg = np.hypot(*np.diff(np.vstack([p, p[:1]]), axis=0).T)
    assert seg.max() < 1.01 and seg.min() > 0.99


def test_smooth_simplify_keep_shape():
    p = resample_closed(rounded_rect(1000, 500, 80), 1.0)
    q = simplify_closed(smooth_closed(p, 2.0), 0.3)
    assert 20 < len(q) < 400
    assert perimeter(q) == pytest.approx(perimeter(p), rel=0.005)


def test_find_corners_rect():
    p = resample_closed(rect(1000, 500), 1.0)
    c = find_corners(p)
    assert len(c) == 4
    for k in c:
        assert k["turn_deg"] == pytest.approx(90, abs=3)


def test_find_corners_rounded():
    p = resample_closed(rounded_rect(1000, 500, 60), 1.0)
    c = find_corners(p)
    assert len(c) == 4
    # zaobljeni ugao radijusa 60 mm: luk = pi/2 * 60 ~ 94 mm; detekcija radi s prozorom 20 mm
    # pa se zona ugla proširi za ~2 prozora sa svake strane (tako je i u izlazu na fotografijama)
    for k in c:
        span = (k["s_end"] - k["s_start"]) % perimeter(p)
        assert 94 <= span < 94 + 6 * 20
        assert k["turn_deg"] == pytest.approx(90, abs=3)


def test_axes_from_points():
    xd, yd = axes_from_points((100, 500), (400, 500))
    assert np.allclose(xd, (1, 0)) and np.allclose(yd, (0, -1))     # klup_lice: x desno, y gore
    xd, yd = axes_from_points((440, 318), (440, 900))
    assert np.allclose(xd, (0, 1)) and np.allclose(yd, (1, 0))      # 1a_prova: x dolje, y desno
    with pytest.raises(ValueError):
        axes_from_points((1, 1), (1, 1))


def test_square_corner():
    # pravokutnik s "odgriženim" donjim lijevim kutom (kao folija zaobljena preko kuta)
    p = rounded_rect(1000, 500, 40)
    p = resample_closed(p, 1.0)
    q = square_corner(ensure_ccw(p), np.array([0.0, 0.0]))
    assert np.min(np.hypot(*(q - [0, 0]).T)) < 1.0         # vrh kuta je u (0,0)
    assert perimeter(q) > perimeter(p)


def test_finish_polyline_start_and_corners():
    p, corners = finish_polyline(resample_closed(rect(1000, 500, 20, 30), 1.0))
    assert len(corners) == 4
    # početak = točka najbliža ishodištu, a nije usred ugla
    assert np.hypot(*(p[0] - [20, 30])) < 30
    # oštar ugao točno na početku smije se prelamati preko početka (kao KLUP LICE, s=3497..17),
    # ali samo taj jedan; ostali su uredni
    wrapped = [c for c in corners if c["s_start"] > c["s_end"]]
    assert len(wrapped) <= 1
    for c in wrapped:
        assert c["s_end"] < 60
