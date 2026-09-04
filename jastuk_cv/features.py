"""Dodaci na elementu (cif, keder, čičak, kopče, rupe, gumbi, vezice, napomene): definicije tipova,
geometrija po obrisu (duljina luka), simboli za DXF/PDF i popis materijala.

Zapis dodatka (JSON u Element.features):
  {"id": "f1", "type": "zip", "s0": 120.0, "s1": 980.0, "params": {"sirina": 5, "strana": "traka"}}
  {"id": "f2", "type": "kopca", "p": [340.0, 25.0], "params": {"vrsta": "druker"}}
Rubni dodaci (zip, keder, cicak) idu po obrisu od s0 do s1 u smjeru obrisa (CCW), s = duljina
luka u mm od početka polilinije. Točkasti dodaci imaju položaj p u mm elementa.
"""
from __future__ import annotations

import numpy as np

# tip -> (naziv, geometrija, zadani parametri)
TYPES = {
    "zip":      ("cif (patentni zatvarač)", "edge",  {"sirina": 5, "strana": "traka"}),
    "keder":    ("keder",                   "edge",  {"promjer": 6}),
    "cicak":    ("čičak traka",             "edge",  {"sirina": 25}),
    "kopca":    ("kopča",                   "point", {"vrsta": "druker"}),
    "rupa":     ("rupa",                    "point", {"promjer": 40}),
    "rupica":   ("rupica (ringica)",        "point", {"promjer": 12}),
    "gumb":     ("gumb",                    "point", {"promjer": 25}),
    "vezica":   ("vezica",                  "point", {"duljina": 300}),
    "napomena": ("napomena",                "point", {"tekst": ""}),
}
EDGE_TYPES = [k for k, v in TYPES.items() if v[1] == "edge"]
POINT_TYPES = [k for k, v in TYPES.items() if v[1] == "point"]


def cumlen(poly: np.ndarray) -> np.ndarray:
    """Duljina luka na svakom vrhu zatvorene polilinije + ukupni opseg na kraju (N+1)."""
    seg = np.diff(np.vstack([poly, poly[:1]]), axis=0)
    return np.concatenate([[0.0], np.cumsum(np.hypot(seg[:, 0], seg[:, 1]))])


def point_at_s(poly: np.ndarray, s: float):
    """Točka i jedinična tangenta na duljini luka s (ciklički)."""
    cl = cumlen(poly)
    L = cl[-1]
    s = s % L
    i = int(np.searchsorted(cl, s, side="right") - 1)
    a, b = poly[i], poly[(i + 1) % len(poly)]
    seg = b - a
    ln = np.hypot(*seg)
    t = (s - cl[i]) / ln if ln > 0 else 0.0
    return a + t * seg, (seg / ln if ln > 0 else np.array([1.0, 0.0]))


def arc(poly: np.ndarray, s0: float, s1: float, step: float = 5.0) -> np.ndarray:
    """Polilinija po obrisu od s0 do s1 u smjeru obrisa (ciklički)."""
    L = cumlen(poly)[-1]
    s0, s1 = s0 % L, s1 % L
    length = (s1 - s0) % L
    if length < 1e-6:
        length = L
    n = max(2, int(length / step) + 1)
    return np.array([point_at_s(poly, s0 + k * length / (n - 1))[0] for k in range(n)])


def project_s(poly: np.ndarray, p) -> float:
    """Duljina luka najbliže točke obrisa točki p."""
    p = np.asarray(p, float)
    cl = cumlen(poly)
    best, bs = 1e18, 0.0
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        seg = b - a
        ln2 = float(seg @ seg)
        t = float(np.clip((p - a) @ seg / ln2, 0, 1)) if ln2 > 0 else 0.0
        d = np.hypot(*(a + t * seg - p))
        if d < best:
            best, bs = d, cl[i] + t * np.sqrt(ln2)
    return bs


def edge_length(poly: np.ndarray, f: dict) -> float:
    L = cumlen(poly)[-1]
    length = (f["s1"] - f["s0"]) % L
    return L if length < 1e-6 else length


def bom(poly: np.ndarray, features: list) -> dict:
    """Popis materijala za jedan element: duljine rubnih dodataka (mm) i broj točkastih."""
    out = {}
    for f in features or []:
        t = f.get("type")
        if t not in TYPES:
            continue
        if TYPES[t][1] == "edge":
            out[t] = out.get(t, 0.0) + edge_length(poly, f)
        else:
            out[t] = out.get(t, 0) + 1
    return out


def label(f: dict) -> str:
    t, p = f.get("type"), f.get("params") or {}
    if t == "zip":
        return f"CIF {p.get('sirina', 5)} mm ({p.get('strana', 'traka')})"
    if t == "keder":
        return f"KEDER Ø{p.get('promjer', 6)}"
    if t == "cicak":
        return f"ČIČAK {p.get('sirina', 25)} mm"
    if t == "kopca":
        return f"KOPČA {p.get('vrsta', '')}".strip()
    if t in ("rupa", "rupica", "gumb"):
        return f"{TYPES[t][0].split(' ')[0].upper()} Ø{p.get('promjer', '')}"
    if t == "vezica":
        return f"VEZICA {p.get('duljina', '')} mm"
    if t == "napomena":
        return str(p.get("tekst", ""))
    return t or "?"
