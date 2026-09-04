"""Slaganje krojnih dijelova na rolu poznate širine (nesting), v1: pravokutni gabariti,
bottom-left "skyline" heuristika, rotacije po materijalu (vinil slobodno, tkanina uzduž), trake uvijek
smiju uzduž role. Cilj je dobra iskoristivost i pouzdan rezultat; radionica po potrebi pomakne komad.

    placements, length = nest(items, roll_width_mm, gap_mm)
    items: [dict(id, poly (N,2) mm, rot_free: bool, kind)]
    placements: [dict(id, rot_deg, dx, dy, poly (postavljeni), bbox)]
"""
from __future__ import annotations

import numpy as np


def _rot(poly: np.ndarray, deg: int) -> np.ndarray:
    a = np.radians(deg)
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    q = poly @ R.T
    return q - q.min(0)


class Skyline:
    """Bottom-left skyline za pravokutnike širine w i visine h na traci širine W (duljina neograničena)."""

    def __init__(self, W: float):
        self.W = W
        self.sky = [(0.0, W, 0.0)]          # (x, širina, y)

    def _fits(self, i, w):
        x, y = self.sky[i][0], self.sky[i][2]
        if x + w > self.W + 1e-6:
            return None
        rest, j = w, i
        while rest > 1e-6:
            if j >= len(self.sky):
                return None
            y = max(y, self.sky[j][2])
            rest -= self.sky[j][1]
            j += 1
        return y

    def place(self, w, h):
        best = None
        for i in range(len(self.sky)):
            y = self._fits(i, w)
            if y is None:
                continue
            x = self.sky[i][0]
            if best is None or (y + h, x) < (best[1] + h, best[0]):
                best = (x, y)
        if best is None:
            return None
        x, y = best
        self._add(x, y + h, w)
        return x, y

    def _add(self, x, top, w):
        new = []
        for sx, sw, sy in self.sky:
            ex = sx + sw
            if ex <= x or sx >= x + w:
                new.append((sx, sw, sy))
                continue
            if sx < x:
                new.append((sx, x - sx, sy))
            if ex > x + w:
                new.append((x + w, ex - (x + w), sy))
        new.append((x, w, top))
        new.sort()
        merged = []
        for seg in new:
            if merged and abs(merged[-1][2] - seg[2]) < 1e-9 and abs(merged[-1][0] + merged[-1][1] - seg[0]) < 1e-9:
                merged[-1] = (merged[-1][0], merged[-1][1] + seg[1], seg[2])
            else:
                merged.append(seg)
        self.sky = merged

    def height(self):
        return max(s[2] for s in self.sky)


def nest(items: list, roll_width: float, gap: float = 15.0) -> tuple[list, float]:
    W = roll_width - gap
    order = sorted(items, key=lambda it: -(np.ptp(it["poly"][:, 0]) * np.ptp(it["poly"][:, 1])))
    sky = Skyline(W)
    out = []
    for it in order:
        rots = (0, 90, 180, 270) if it.get("rot_free") else (0, 180)
        if it.get("kind") == "TRAKA":
            rots = (90, 0)                          # traka uzduž role
        cands = []
        for r in rots:
            q = _rot(np.asarray(it["poly"], float), r)
            w, h = q[:, 0].max() + gap, q[:, 1].max() + gap
            if w > W + 1e-6:
                continue
            cands.append((r, q, w, h))
        if not cands:
            raise ValueError(f"dio {it['id']} je širi od role ({np.ptp(it['poly'], axis=0)} mm > {roll_width})")
        best = None
        for r, q, w, h in cands:
            trial = Skyline(W); trial.sky = list(sky.sky)
            pos = trial.place(w, h)
            if pos is None:
                continue
            score = (trial.height(), pos[1], pos[0])
            if best is None or score < best[0]:
                best = (score, r, q, w, h, pos)
        _, r, q, w, h, (x, y) = best
        sky.place(w, h)
        placed = q + [x + gap / 2, y + gap / 2]
        out.append(dict(id=it["id"], rot_deg=r, dx=x + gap / 2, dy=y + gap / 2, poly=placed,
                        bbox=(placed.min(0).tolist(), placed.max(0).tolist())))
    return out, float(sky.height() + gap / 2)


def utilization(placements: list, roll_width: float, length: float) -> float:
    from shapely.geometry import Polygon
    area = sum(Polygon(p["poly"]).area for p in placements)
    return float(area / (roll_width * length)) if length > 0 else 0.0
