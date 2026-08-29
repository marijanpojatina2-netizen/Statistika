#!/usr/bin/env python3
"""Generira PWA ikone (plava lopta na bijeloj podlozi) bez vanjskih ovisnosti."""
import math, struct, zlib, os

BLUE = (0x00, 0x5B, 0xAC)
WHITE = (0xFF, 0xFF, 0xFF)

def draw(size, maskable=False):
    px = [[WHITE[0], WHITE[1], WHITE[2], 255] for _ in range(size * size)]
    cx = cy = (size - 1) / 2.0
    pad = 0.10 if maskable else 0.06
    r = size * (0.5 - pad)
    seam = max(2.0, size * 0.035)
    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            if d > r:
                continue
            c = BLUE
            # okomiti i vodoravni sav
            if abs(dx) < seam / 2 or abs(dy) < seam / 2:
                c = WHITE
            # dva bocna luka
            for sign in (-1, 1):
                ox = cx + sign * r * 1.05
                dd = abs(math.hypot(x - ox, dy) - r * 1.05)
                if dd < seam / 2:
                    c = WHITE
            i = y * size + x
            px[i] = [c[0], c[1], c[2], 255]
    raw = b''
    for y in range(size):
        raw += b'\x00' + bytes(v for x in range(size) for v in px[y * size + x])
    return raw

def png(size, raw, path):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(out)
    print('napisano', path, len(out), 'B')

here = os.path.join(os.path.dirname(__file__), '..', 'public')
os.makedirs(here, exist_ok=True)
for s in (192, 512):
    png(s, draw(s), os.path.join(here, f'icon-{s}.png'))
png(512, draw(512, maskable=True), os.path.join(here, 'icon-maskable-512.png'))
