"""Izvlačenje crne konture krojnog uzorka iz ispravljene slike (1 px = 1 mm) i pretvorba
u glatki zatvoreni polyline. Kontura = središnjica poteza crnog flomastera."""
from __future__ import annotations

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d


def dark_mask(rect_bgr: np.ndarray, r_strong: float = 0.45, r_weak: float = 0.65, bg_block: int = 151) -> np.ndarray:
    """Crni potezi: omjer sivog tona i lokalne pozadine (medijan 151 px, izravnava osvjetljenje).
    Flomaster: omjer 0.1-0.45; sjene folije uglavnom > 0.6; crvene linije mreže ~0.78.
    Histereza: slabo tamni pikseli (tanka olovka preko osi, blijedi potezi) ostaju samo ako su
    povezani sa sigurno tamnima; crvenkasti slabi pikseli se odbacuju."""
    gray = cv2.cvtColor(rect_bgr, cv2.COLOR_BGR2GRAY)
    bg = cv2.medianBlur(gray, bg_block).astype(np.float32) + 1.0
    ratio = gray.astype(np.float32) / bg
    f = rect_bgr.astype(np.float32)
    red = f[..., 2] - 0.5 * (f[..., 1] + f[..., 0])
    not_red = red < 8
    strong = (ratio < r_strong).astype(np.uint8)
    weak = (((ratio < r_weak) & not_red) | (strong > 0)).astype(np.uint8)
    weak = cv2.morphologyEx(weak, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(weak)
    keep = np.zeros(n, bool)
    keep[np.unique(lab[strong > 0])] = True
    keep[stats[:, cv2.CC_STAT_AREA] < 60] = False   # sitne mrlje, točke mreže
    keep[0] = False
    m = keep[lab].astype(np.uint8) * 255
    valid = (rect_bgr.sum(2) > 0).astype(np.uint8) * 255  # izvan preslikanog područja je crno
    m = cv2.bitwise_and(m, cv2.erode(valid, np.ones((9, 9), np.uint8)))
    return m


def bridge_gaps(m: np.ndarray, max_gap: float = 80.0, thickness: int = 3, max_angle_deg: float = 50.0) -> np.ndarray:
    """Premošćuje prekide poteza: krajevi skeleta koji su bliži od max_gap spajaju se linijom ako
    smjer poteza na oba kraja pokazuje približno jedan prema drugom (crtice na osima se tako
    ne spajaju bočno). Najbliži parovi prvi; svaki kraj najviše jednom."""
    from skimage.morphology import skeletonize
    sk = skeletonize(m > 0)
    sku = sk.astype(np.uint8)
    nb = cv2.filter2D(sku, -1, np.ones((3, 3), np.uint8), borderType=cv2.BORDER_CONSTANT)
    ends = np.argwhere(sk & (nb == 2))          # piksel + točno 1 susjed
    if len(ends) < 2:
        return m
    h, w = m.shape
    dirs = []
    for y, x in ends:
        y0, y1, x0, x1 = max(0, y - 10), min(h, y + 11), max(0, x - 10), min(w, x + 11)
        pts = np.argwhere(sk[y0:y1, x0:x1]) + [y0, x0]
        d = np.array([y, x], float) - pts.mean(0)
        n_ = np.linalg.norm(d)
        dirs.append(d / n_ if n_ > 1e-6 else np.zeros(2))
    dirs = np.array(dirs)
    cos_max = np.cos(np.radians(max_angle_deg))
    pairs = []
    for i in range(len(ends)):
        for j in range(i + 1, len(ends)):
            v = ends[j] - ends[i]
            d = np.hypot(*v)
            if d > max_gap or d < 1e-6:
                continue
            v = v / d
            if np.dot(dirs[i], v) > cos_max and np.dot(dirs[j], -v) > cos_max:
                pairs.append((d, i, j))
    pairs.sort()
    used = set()
    out = m.copy()
    for d, i, j in pairs:
        if i in used or j in used:
            continue
        used.update((i, j))
        cv2.line(out, (int(ends[i][1]), int(ends[i][0])), (int(ends[j][1]), int(ends[j][0])), 255, thickness)
    return out


def directional_close(m: np.ndarray, L: int) -> np.ndarray:
    """Premošćuje prekide u tankim linijama (do ~L px) zatvaranjem linijskim elementima u 4 smjera;
    za razliku od kružnog elementa ne spaja točke mreže međusobno."""
    out = np.zeros_like(m)
    for ang in (0, 45, 90, 135):
        k = np.zeros((L, L), np.uint8)
        c = L // 2
        if ang == 0:
            k[c, :] = 1
        elif ang == 90:
            k[:, c] = 1
        elif ang == 45:
            k[np.arange(L), np.arange(L)] = 1
        else:
            k[np.arange(L), L - 1 - np.arange(L)] = 1
        out = cv2.bitwise_or(out, cv2.morphologyEx(m, cv2.MORPH_CLOSE, k))
    return out


def light_ratio(rect_bgr: np.ndarray, bg_block: int = 151) -> np.ndarray:
    gray = cv2.cvtColor(rect_bgr, cv2.COLOR_BGR2GRAY)
    bg = cv2.medianBlur(gray, bg_block).astype(np.float32) + 1.0
    return gray.astype(np.float32) / bg


def thin_dark_lines(ratio: np.ndarray, d: int = 4, contrast: float = 0.12, max_ratio: float = 0.68) -> np.ndarray:
    """Tanke tamne linije (olovka preko osi): piksel tamniji od OBJE strane na udaljenosti d
    (simetričan 'ridge' test - odsjaji folije imaju svijetlu samo jednu stranu)."""
    best = np.zeros_like(ratio)
    for dy, dx in ((0, d), (d, 0), (d, d), (d, -d)):
        a = np.roll(np.roll(ratio, dy, 0), dx, 1)
        b = np.roll(np.roll(ratio, -dy, 0), -dx, 1)
        best = np.maximum(best, np.minimum(a - ratio, b - ratio))
    m = ((best > contrast) & (ratio < max_ratio)).astype(np.uint8) * 255
    return cv2.dilate(m, np.ones((3, 3), np.uint8))


def extract_outline(rect_bgr: np.ndarray, seed_px, T: float = 0.50, r_seal: int = 6, r_close: int = 20,
                    r_bay: int = 60, max_bay_px: int = 4000, debug: dict | None = None):
    """Vraća (polyline px (N,2) zatvoren, debljina poteza po točki (px), maska unutrašnjosti).

    Barijera = crni potez (omjer prema lokalnoj pozadini < T) + tanke tamne linije (olovka).
    Unutrašnjost uzorka = svijetlo područje povezano sa sjemenom točkom; rast se radi na
    erodiranoj svijetloj maski (radijus r_seal, po potrebi veći), pa uski prekidi u potezu
    (folija preko linije, blijedi dio) ne 'cure' prema van, a zatim se područje geodetski vrati
    do unutarnjeg ruba poteza. Kontura = unutarnji rub poteza pomaknut prema van za pola
    tipične (medijan) debljine poteza, tj. središnjica poteza."""
    ratio = light_ratio(rect_bgr)
    valid = (rect_bgr.sum(2) > 0).astype(np.uint8) * 255           # područje pokriveno fotografijom
    valid = cv2.morphologyEx(valid, cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))  # rupe od crne tinte
    valid = cv2.erode(valid, np.ones((9, 9), np.uint8), borderValue=0)
    valid[:9, :] = 0; valid[-9:, :] = 0; valid[:, :9] = 0; valid[:, -9:] = 0
    f = rect_bgr.astype(np.float32)
    red = f[..., 2] - 0.5 * (f[..., 1] + f[..., 0])
    thin = cv2.bitwise_and(thin_dark_lines(ratio), (red < 10).astype(np.uint8) * 255)  # bez crvenih linija mreže
    # crveni flomaster (natpisi, pomoćne linije unutar uzorka) nije barijera
    dark = cv2.bitwise_and((ratio < T).astype(np.uint8) * 255, (red < 25).astype(np.uint8) * 255)
    barrier = cv2.bitwise_or(dark, thin)
    light = cv2.bitwise_and(cv2.bitwise_not(barrier), valid)
    # pojas uz rub fotografije (9..20 px od ruba): ako unutrašnjost dođe do njega, 'curi' van
    border_band = cv2.bitwise_and(valid, cv2.bitwise_not(cv2.erode(valid, np.ones((23, 23), np.uint8), borderValue=0)))
    h, w = light.shape
    sx, sy = int(seed_px[0]), int(seed_px[1])
    region = None
    for r in range(r_seal, 4 * r_seal + 1, 2):
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
        light_e = cv2.erode(light, k)                            # brtvljenje prekida užih od 2r
        n, lab, stats, _ = cv2.connectedComponentsWithStats(light_e, connectivity=4)
        # sjeme: najveća komponenta erodirane svijetle maske u prozoru +-100 px oko zadane točke
        win = lab[max(0, sy - 100):sy + 100, max(0, sx - 100):sx + 100]
        ids = np.unique(win)
        ids = ids[ids > 0]
        if len(ids) == 0:
            raise RuntimeError("sjeme nije blizu svijetlog područja")
        cid = ids[int(np.argmax(stats[ids, cv2.CC_STAT_AREA]))]
        reg = (lab == cid).astype(np.uint8) * 255
        # vraćanje: dilatacija istim elementom (prekidi u potezu ostaju 'zatvoreni' lukom
        # radijusa r), ograničeno na svijetlu masku
        reg = cv2.bitwise_and(cv2.dilate(reg, k), light)
        if cv2.bitwise_and(reg, border_band).any():
            continue                                             # prekid širi od 2r: povećaj r
        region = reg
        if debug is not None:
            debug["r_seal"] = r
        break
    if region is None:
        raise RuntimeError("unutrašnjost curi do ruba slike - povećaj r_seal ili smanji T")
    # ukloni tekst, strelice i sjene folije koje se unutar uzorka naslanjaju na potez:
    # zatvaranje radijusom r_close popunjava udubine uže od 2*r_close (uzorci nemaju tako uske
    # konkavne dijelove)
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r_close + 1, 2 * r_close + 1))
    region = cv2.morphologyEx(region, cv2.MORPH_CLOSE, k3)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(region, connectivity=4)
    region = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8) * 255
    # veće 'uvale' (strelice, natpisi crnim flomasterom naslonjeni na potez): zatvaranje velikim
    # radijusom (uz nulti obrub da rub slike ne stvara lažne uvale) i popunjavanje uvala manjih
    # od max_bay_px (stvarne konkavne značajke uzoraka su puno veće)
    pad = r_bay + 2
    kb = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r_bay + 1, 2 * r_bay + 1))
    padded = cv2.copyMakeBorder(region, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    closed = cv2.morphologyEx(padded, cv2.MORPH_CLOSE, kb)[pad:-pad, pad:-pad]
    bays = cv2.bitwise_and(closed, cv2.bitwise_not(region))
    nb, labb, statsb, _ = cv2.connectedComponentsWithStats(bays)
    for i in range(1, nb):
        if statsb[i, cv2.CC_STAT_AREA] < max_bay_px:
            region[labb == i] = 255
    cnts, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    ic = max(cnts, key=cv2.contourArea)
    inner = np.zeros_like(region)
    cv2.drawContours(inner, [ic], -1, 255, cv2.FILLED)
    ic = ic.reshape(-1, 2)
    # debljina poteza: od unutarnjeg ruba prema van kroz tamne piksele
    band = cv2.bitwise_or(barrier, inner)          # potez (barijera) + unutrašnjost
    d_out = cv2.distanceTransform(band, cv2.DIST_L2, 5)
    stroke = d_out[ic[:, 1], ic[:, 0]]
    t = float(np.median(stroke))
    if not np.isfinite(t) or t > 30:
        raise RuntimeError("neuspjela procjena debljine poteza (t=%s)" % t)
    half = max(1, int(round(t / 2)))
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * half + 1, 2 * half + 1))
    mid = cv2.dilate(inner, k2)
    cnts, _ = cv2.findContours(mid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cnts, key=cv2.contourArea).reshape(-1, 2).astype(float)
    if debug is not None:
        debug.update(light=light, inner=inner, mid=mid, barrier=barrier)
    return c, stroke, inner


def resample_closed(pts: np.ndarray, step: float) -> np.ndarray:
    pts = np.asarray(pts, float)
    seg = np.diff(np.vstack([pts, pts[:1]]), axis=0)
    L = np.hypot(seg[:, 0], seg[:, 1])
    s = np.concatenate([[0], np.cumsum(L)])
    total = s[-1]
    n = max(8, int(round(total / step)))
    t = np.linspace(0, total, n, endpoint=False)
    closed = np.vstack([pts, pts[:1]])
    x = np.interp(t, s, closed[:, 0])
    y = np.interp(t, s, closed[:, 1])
    return np.stack([x, y], 1)


def smooth_closed(pts: np.ndarray, sigma: float) -> np.ndarray:
    return np.stack([gaussian_filter1d(pts[:, i], sigma, mode="wrap") for i in range(2)], 1)


def simplify_closed(pts: np.ndarray, eps: float) -> np.ndarray:
    c = pts.reshape(-1, 1, 2).astype(np.float32)
    a = cv2.approxPolyDP(c, eps, True)
    return a.reshape(-1, 2).astype(float)


def ensure_ccw(pts: np.ndarray) -> np.ndarray:
    x, y = pts[:, 0], pts[:, 1]
    area = 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)
    return pts if area > 0 else pts[::-1].copy()


def perimeter(pts: np.ndarray) -> float:
    seg = np.diff(np.vstack([pts, pts[:1]]), axis=0)
    return float(np.hypot(seg[:, 0], seg[:, 1]).sum())


def find_corners(pts_mm: np.ndarray, window: float = 20.0, min_turn_deg: float = 25.0, rate_deg: float = 8.0):
    """Detekcija uglova (i zaobljenih) na zatvorenoj krivulji u mm.
    Ugao = neprekinuti dio krivulje gdje je promjena smjera tangente po `window` mm veća od
    `rate_deg`, a ukupni zakret ugla veći od `min_turn_deg`.
    Vraća listu dict(s_start, s_end, s_apex, turn_deg) s duljinama luka od početka polyline-a."""
    p = resample_closed(pts_mm, 1.0)
    n = len(p)
    w = int(window)
    tang = np.roll(p, -w // 2, 0) - np.roll(p, w // 2, 0)
    ang = np.unwrap(np.arctan2(tang[:, 1], tang[:, 0]))
    dtheta = np.degrees(np.roll(ang, -w // 2) - np.roll(ang, w // 2))  # zakret po 'window' mm
    hot = np.abs(dtheta) > rate_deg
    # segmenti (ciklički)
    if hot.all():
        return []
    start = int(np.argmin(hot))  # početak u 'hladnoj' zoni
    hot_r = np.roll(hot, -start)
    corners = []
    i = 0
    while i < n:
        if hot_r[i]:
            j = i
            while j < n and hot_r[j]:
                j += 1
            a, b = (i + start) % n, (j - 1 + start) % n
            idx = [(k + start) % n for k in range(i, j)]
            turn = float(np.degrees(ang[(b + w // 2) % n] - ang[(a - w // 2) % n]))
            turn = (turn + 180) % 360 - 180
            if abs(turn) >= min_turn_deg:
                apex = idx[int(np.argmax(np.abs(dtheta[idx])))]
                corners.append(dict(s_start=float(a), s_end=float(b), s_apex=float(apex),
                                    turn_deg=turn, p_start=p[a], p_end=p[b], p_apex=p[apex]))
            i = j
        else:
            i += 1
    corners.sort(key=lambda c: c["s_start"])
    return corners
