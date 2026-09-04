"""Provjera i učitavanje startnog popisa brodova (data/brodovi.csv).

    python3 data/seed_boats.py            # provjera + sažetak
    python3 data/seed_boats.py --json     # ispis kao JSON (za punjenje baze u fazi 1)

Kad bude baza (PostgreSQL), ova skripta puni tablice builders / boat_models / boat_variants
idempotentno; do tada je izvor istine CSV.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import Counter

CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "brodovi.csv")
TIPOVI = {"jedrilica", "katamaran", "motorni"}


def load(path: str = CSV) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    errors = []
    seen = set()
    for i, r in enumerate(rows, 2):
        key = (r["proizvodjac"], r["model"])
        if key in seen:
            errors.append(f"redak {i}: duplikat {key}")
        seen.add(key)
        if r["tip"] not in TIPOVI:
            errors.append(f"redak {i}: tip '{r['tip']}' nije u {sorted(TIPOVI)}")
        try:
            r["loa_m"] = float(r["loa_m"])
            r["sirina_m"] = float(r["sirina_m"])
            r["godina_od"] = int(r["godina_od"])
            r["godina_do"] = int(r["godina_do"]) if r["godina_do"] else None
            r["prioritet"] = int(r["prioritet"]) if r["prioritet"] else None
        except ValueError as ex:
            errors.append(f"redak {i}: {ex}")
            continue
        if not (5 < r["loa_m"] < 30) or not (2 < r["sirina_m"] < 12):
            errors.append(f"redak {i}: sumnjive dimenzije {r['loa_m']} x {r['sirina_m']}")
        if r["godina_do"] and r["godina_do"] < r["godina_od"]:
            errors.append(f"redak {i}: godina_do < godina_od")
        r["kabine"] = [int(k) for k in r["kabine"].split("/")] if r["kabine"] else []
    if errors:
        raise SystemExit("brodovi.csv:\n  " + "\n  ".join(errors))
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="ispiši JSON umjesto sažetka")
    a = ap.parse_args(argv)
    rows = load()
    if a.json:
        json.dump(rows, sys.stdout, ensure_ascii=False, indent=1)
        return
    by_type = Counter(r["tip"] for r in rows)
    by_builder = Counter(r["proizvodjac"] for r in rows)
    print(f"{len(rows)} modela: " + ", ".join(f"{k} {v}" for k, v in by_type.items()))
    print("po proizvođaču: " + ", ".join(f"{k} {v}" for k, v in by_builder.most_common()))
    prio = sorted((r for r in rows if r["prioritet"]), key=lambda r: r["prioritet"])
    print("prioritet (prvih 5 za sheme i pilot):")
    for r in prio:
        print(f"  {r['prioritet']}. {r['proizvodjac']} {r['model']} ({r['godina_od']}–{r['godina_do'] or ''}, kabine {r['kabine']})")


if __name__ == "__main__":
    main()
