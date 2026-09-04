"""Naredbeni redak: popis elemenata (JSON) -> DXF/PDF/JSON/kontrolne slike.

    python3 -m jastuk_cv fotke/elementi.json --out izlaz

JSON je lista elemenata; putanje fotografija su relativne prema JSON datoteci:
    {"key": "klup_lice", "file": "klup_lice.jpg", "layer": "KLUP LICE",
     "origin_px": [367, 1872], "xdir": [1, 0], "ydir": [0, -1],      # ili "x_axis_px": [x, y]
     "px_per_cm": 12.0,                                               # neobavezno
     "seed_cm": [25, 70],                                             # ili "seed_px": [x, y]
     "square_corner_cm": [0, 0]}                                      # neobavezno
"""
from __future__ import annotations

import argparse
import json
import logging
import os

import cv2

from .measure import measure_grid
from . import outputs

log = logging.getLogger("jastuk_cv")


def load_job(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        elems = json.load(f)
    base = os.path.dirname(os.path.abspath(path))
    for e in elems:
        e["file"] = os.path.join(base, e["file"])
    return elems


def process(e: dict, out_dir: str) -> dict:
    log.info("== %s  (%s)", e["layer"], e["file"])
    img = cv2.imread(e["file"])
    if img is None:
        raise FileNotFoundError(e["file"])
    m = measure_grid(img, e["origin_px"], xdir=e.get("xdir"), ydir=e.get("ydir"), x_axis_px=e.get("x_axis_px"),
                     px_per_cm=e.get("px_per_cm"), seed_cm=e.get("seed_cm"), seed_px=e.get("seed_px"),
                     square_corner_cm=e.get("square_corner_cm"))
    ctl = os.path.join(out_dir, "kontrola")
    os.makedirs(ctl, exist_ok=True)
    imgs = m.control_images(img)
    cv2.imwrite(os.path.join(ctl, f"{e['key']}_ispravljeno_kontura.png"), imgs["rectified"])
    cv2.imwrite(os.path.join(ctl, f"{e['key']}_detekcija_mreze.png"), imgs["detection"])
    r = m.as_result(e["key"], e["layer"], e["file"])
    r["json"] = dict(layer=e["layer"], file=os.path.relpath(e["file"]), **m.to_dict())
    return r


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job", help="JSON s popisom elemenata")
    ap.add_argument("--out", default="izlaz", help="izlazna mapa (zadano: izlaz)")
    ap.add_argument("-q", "--quiet", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.WARNING if a.quiet else logging.INFO, format="%(message)s")
    os.makedirs(a.out, exist_ok=True)
    results = [process(e, a.out) for e in load_job(a.job)]
    with open(os.path.join(a.out, "konture_mm.json"), "w", encoding="utf-8") as f:
        json.dump([r["json"] for r in results], f, ensure_ascii=False, indent=1)
    outputs.write_elements_1_1(results, os.path.join(a.out, "elementi_1_1"))
    outputs.write_strip_offset(results, os.path.join(a.out, "elementi_traka_offset"))
    log.info("gotovo -> %s", a.out)


if __name__ == "__main__":
    main()
