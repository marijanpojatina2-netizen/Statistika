import numpy as np
import pytest

from jastuk_cv.nesting import nest, utilization, Skyline


def rect(w, h):
    return np.array([[0, 0], [w, 0], [w, h], [0, h]], float)


def test_skyline_basic():
    s = Skyline(1000)
    assert s.place(600, 100) == (0, 0)
    assert s.place(400, 50) == (600, 0)
    assert s.place(500, 100) == (600, 50) or s.place(500, 100)[1] <= 100
    assert s.height() >= 150


def test_nest_rects_no_overlap_and_width():
    items = [dict(id=f"r{i}", poly=rect(500, 300), rot_free=True, kind="LICE") for i in range(6)]
    items.append(dict(id="t", poly=rect(2800, 90), rot_free=False, kind="TRAKA"))
    pl, L = nest(items, 1370, 15)
    assert len(pl) == 7
    from shapely.geometry import Polygon
    polys = [Polygon(p["poly"]) for p in pl]
    for i in range(len(polys)):
        for j in range(i + 1, len(polys)):
            assert polys[i].intersection(polys[j]).area < 1e-6
        assert polys[i].bounds[0] >= -1e-6 and polys[i].bounds[2] <= 1370 + 1e-6
    strip = next(p for p in pl if p["id"] == "t")
    assert strip["rot_deg"] in (90, 270) and strip["bbox"][1][1] - strip["bbox"][0][1] == pytest.approx(2800)
    assert 2800 <= L < 3000 and utilization(pl, 1370, L) > 0.25   # lica stanu uz traku, duljina role = traka


def test_nest_grain_restriction():
    items = [dict(id="a", poly=rect(1000, 300), rot_free=False, kind="LICE")]
    pl, L = nest(items, 1370)
    assert pl[0]["rot_deg"] in (0, 180)
    with pytest.raises(ValueError):
        nest([dict(id="x", poly=rect(1500, 300), rot_free=False, kind="LICE")], 1370)
    pl2, _ = nest([dict(id="x", poly=rect(1500, 300), rot_free=True, kind="LICE")], 1370)
    assert pl2[0]["rot_deg"] in (90, 270)
