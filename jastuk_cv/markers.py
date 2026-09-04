"""Mjerenje s fotografije odozgo uz ArUco markere (metoda B).

Na ravnu plohu se polože markeri poznate stranice (zadano 80 mm, DICT_5X5_50). Njihov međusobni
položaj NIJE poznat, ali svi leže u istoj ravnini i svaki je kvadrat poznate veličine. Tražimo
jednu homografiju slika -> ravnina (mm) takvu da se svaki marker preslika u kvadrat stranice
`marker_mm` (položaj i zakret svakog markera su slobodni parametri). To ne traži kalibraciju
kamere; točnost raste s brojem i raspršenošću markera oko elementa.

    plane = fit_plane(img, marker_mm=80)          # homografija + ostatak prilagodbe (mm)
    rect, origin = rectify_plane(img, plane)      # tlocrt 1 px = 1 mm
    poly_mm = segment_seed(rect, seed_rect_px)    # kontura elementa iz jednog dodira
"""
from __future__ import annotations

import dataclasses
import logging

import cv2
import numpy as np
from scipy.optimize import least_squares

log = logging.getLogger("jastuk_cv")

DICTS = {
    "DICT_5X5_50": cv2.aruco.DICT_5X5_50,
    "DICT_4X4_50": cv2.aruco.DICT_4X4_50,
    "DICT_6X6_250": cv2.aruco.DICT_6X6_250,
}


@dataclasses.dataclass
class PlaneFit:
    H_img_to_mm: np.ndarray        # 3x3: piksel slike -> mm u ravnini
    ids: list                      # ID-ovi markera koji su ušli u prilagodbu
    corners_px: np.ndarray         # (n,4,2) uglovi markera u slici
    poses_mm: np.ndarray           # (n,3) x, y, theta svakog markera u ravnini
    rms_mm: float                  # RMS ostatak uglova markera nakon prilagodbe (mm)
    max_mm: float
    mm_per_px: float               # približno mjerilo u sredini markera (za procjenu rezolucije)
    dropped_ids: list = dataclasses.field(default_factory=list)   # markeri izbačeni jer nisu u ravnini s ostalima
    per_marker_rms_mm: dict = dataclasses.field(default_factory=dict)

    def img_to_mm(self, pts_px) -> np.ndarray:
        return cv2.perspectiveTransform(np.asarray(pts_px, np.float64).reshape(-1, 1, 2), self.H_img_to_mm).reshape(-1, 2)

    def mm_to_img(self, pts_mm) -> np.ndarray:
        return cv2.perspectiveTransform(np.asarray(pts_mm, np.float64).reshape(-1, 1, 2), np.linalg.inv(self.H_img_to_mm)).reshape(-1, 2)

    def quality(self) -> dict:
        return dict(n_markers=len(self.ids), marker_ids=[int(i) for i in self.ids], fit_rms_mm=round(self.rms_mm, 2),
                    fit_max_mm=round(self.max_mm, 2), mm_per_px=round(self.mm_per_px, 3),
                    dropped_ids=[int(i) for i in self.dropped_ids],
                    per_marker_rms_mm={int(k): round(v, 2) for k, v in self.per_marker_rms_mm.items()})


# --------------------------------------------------------------------------- detekcija
def detect_markers(img_bgr: np.ndarray, dict_name: str = "DICT_5X5_50"):
    """Vraća (ids (n,), corners (n,4,2)) sa sub-pikselno doraćenim uglovima."""
    d = cv2.aruco.getPredefinedDictionary(DICTS[dict_name])
    p = cv2.aruco.DetectorParameters()
    p.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    p.cornerRefinementWinSize = 7
    p.adaptiveThreshWinSizeMax = 53
    det = cv2.aruco.ArucoDetector(d, p)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    corners, ids, _ = det.detectMarkers(gray)
    if ids is None or len(ids) == 0:
        return np.zeros(0, int), np.zeros((0, 4, 2))
    ids = ids.ravel()
    c = np.array([x.reshape(4, 2) for x in corners], float)
    # jedan ID smije biti samo jednom (dvije kartice s istim ID-om zbunjuju prilagodbu)
    keep = [i for i in range(len(ids)) if list(ids).count(ids[i]) == 1]
    ids, c = ids[keep], c[keep]
    c = np.array([refine_square_edges(gray, q) for q in c])
    return ids, c


def _edge_crossing(profile: np.ndarray, frac: float = 0.5):
    """Sub-pikselni položaj prijelaza u 1D profilu: prvi prelazak razine između medijana početka
    (unutra/tamno) i medijana kraja (vani/svijetlo). None ako nema kontrasta."""
    k = max(2, len(profile) // 6)
    a, b = np.median(profile[:k]), np.median(profile[-k:])
    if abs(b - a) < 12:
        return None
    lvl = a + frac * (b - a)
    sgn = np.sign(profile - lvl)
    idx = np.nonzero(sgn[:-1] * sgn[1:] <= 0)[0]
    if len(idx) == 0:
        return None
    i = idx[len(idx) // 2] if len(idx) > 1 else idx[0]
    p0, p1 = profile[i], profile[i + 1]
    return i + (lvl - p0) / (p1 - p0) if p1 != p0 else float(i)


def refine_square_edges(gray: np.ndarray, corners: np.ndarray, n_samples: int = 24, half: int = 6) -> np.ndarray:
    """Uglovi markera iz presjecišta rubnih pravaca. Svaki rub: profil intenziteta okomito na rub na
    n_samples mjesta, položaj 50 % prijelaza crno->bijelo (nepristran za simetrično zamućenje, za
    razliku od cornerSubPix na L-uglu), pravac kroz te točke (robusno), presjecišta susjednih pravaca."""
    h, w = gray.shape
    lines = []
    for k in range(4):
        a, b = corners[k], corners[(k + 1) % 4]
        d = b - a
        L = np.hypot(*d)
        if L < 12:
            return corners
        d /= L
        nrm = np.array([-d[1], d[0]])                       # prema van (ArUco uglovi su CW u slici? provjeri smjer)
        ctr = corners.mean(0)
        if np.dot(nrm, a - ctr) < 0:
            nrm = -nrm
        pts = []
        ts = np.linspace(0.15, 0.85, n_samples)
        offs = np.arange(-half, half + 1, 0.5)
        for t in ts:
            base = a + t * (b - a)
            sample = base[None, :] + offs[:, None] * nrm[None, :]
            if (sample < 1).any() or (sample[:, 0] >= w - 1).any() or (sample[:, 1] >= h - 1).any():
                continue
            prof = cv2.remap(gray, sample[:, 0].astype(np.float32).reshape(-1, 1),
                             sample[:, 1].astype(np.float32).reshape(-1, 1), cv2.INTER_LINEAR).ravel().astype(float)
            x = _edge_crossing(prof)
            if x is not None:
                pts.append(base + (offs[0] + 0.5 * x) * nrm)
        if len(pts) < 6:
            return corners
        pts = np.array(pts)
        c0 = np.median(pts, 0)
        _, _, vt = np.linalg.svd(pts - c0)
        dirv = vt[0]
        # odbaci točke daleko od pravca i ponovi
        r = np.abs((pts - c0) @ np.array([-dirv[1], dirv[0]]))
        good = r < max(0.6, 3 * np.median(r) + 0.2)
        if good.sum() >= 4:
            c0 = pts[good].mean(0)
            _, _, vt = np.linalg.svd(pts[good] - c0)
            dirv = vt[0]
        lines.append((c0, dirv))
    out = np.zeros((4, 2))
    for k in range(4):
        (p1, d1), (p2, d2) = lines[k - 1], lines[k]          # rub prije ugla k i rub poslije
        A = np.array([d1, -d2]).T
        if abs(np.linalg.det(A)) < 1e-9:
            return corners
        t = np.linalg.solve(A, p2 - p1)
        out[k] = p1 + t[0] * d1
    if np.abs(out - corners).max() > 4:                      # nešto je pošlo krivo: zadrži original
        return corners
    return out


def refine_contour_edges(rect_bgr: np.ndarray, poly_px: np.ndarray, half: int = 14, step: float = 0.5) -> np.ndarray:
    """Pomiče točke konture na mjesto 50 % prijelaza boje (Lab) između unutrašnjosti i okoline duž
    normale. Nepristrano za meke rubove; točke bez kontrasta ostaju gdje jesu. Pomaci se medijanski
    filtriraju duž konture (odbacivanje šuma i sjena)."""
    lab = cv2.cvtColor(rect_bgr, cv2.COLOR_BGR2Lab).astype(np.float32)
    h, w = lab.shape[:2]
    p = np.asarray(poly_px, float)
    n = len(p)
    tang = np.roll(p, -3, 0) - np.roll(p, 3, 0)
    tang /= np.maximum(np.hypot(tang[:, 0], tang[:, 1])[:, None], 1e-6)
    nrm = np.stack([tang[:, 1], -tang[:, 0]], 1)            # za CCW konturu (y dolje) pokazuje van
    # provjera smjera normale: točka + 5*nrm mora biti izvan poligona
    test = p[0] + 5 * nrm[0]
    if cv2.pointPolygonTest(p.astype(np.float32), (float(test[0]), float(test[1])), False) > 0:
        nrm = -nrm
    offs = np.arange(-half, half + step, step)
    shift = np.full(n, np.nan)
    for i in range(n):
        sample = p[i][None, :] + offs[:, None] * nrm[i][None, :]
        if (sample < 1).any() or (sample[:, 0] >= w - 1).any() or (sample[:, 1] >= h - 1).any():
            continue
        prof = cv2.remap(lab, sample[:, 0].astype(np.float32).reshape(-1, 1), sample[:, 1].astype(np.float32).reshape(-1, 1),
                         cv2.INTER_LINEAR).reshape(-1, 3)
        k = max(3, len(prof) // 6)
        cin, cout = np.median(prof[:k], 0), np.median(prof[-k:], 0)
        axis = cout - cin
        contrast = np.linalg.norm(axis)
        if contrast < 10:
            continue
        proj = (prof - cin) @ axis / contrast ** 2           # 0 unutra .. 1 vani
        x = _edge_crossing(proj * 100.0)
        if x is not None:
            shift[i] = offs[0] + step * x
    ok = ~np.isnan(shift)
    if ok.sum() < n // 3:
        return p
    # interpolacija nedostajućih po konturi (ciklički) + medijan 9 + Gauss
    idx = np.arange(n)
    full = np.interp(idx, idx[ok], shift[ok], period=n)
    from scipy.ndimage import median_filter, gaussian_filter1d
    full = median_filter(full, size=9, mode="wrap")
    full = gaussian_filter1d(full, 2.0, mode="wrap")
    full = np.clip(full, -half, half)
    return p + full[:, None] * nrm


def _square(marker_mm: float) -> np.ndarray:
    s = marker_mm / 2
    return np.array([[-s, -s], [s, -s], [s, s], [-s, s]], float)   # isti redoslijed kao ArUco: TL, TR, BR, BL


def _apply_h(H, pts):
    p = np.hstack([pts, np.ones((len(pts), 1))]) @ H.T
    return p[:, :2] / p[:, 2:3]


def _pose_square(x, y, th, marker_mm):
    c, s = np.cos(th), np.sin(th)
    return _square(marker_mm) @ np.array([[c, s], [-s, c]]) + [x, y]


def fit_plane(img_bgr: np.ndarray, marker_mm: float = 80.0, dict_name: str = "DICT_5X5_50", min_markers: int = 2,
              outlier_rms_mm: float = 1.5) -> PlaneFit:
    """Detekcija + prilagodba ravnine. Marker koji ne leži u ravnini s ostalima (npr. jedan na ležaju, ostali
    na jastuku) ima velik ostatak; dok ih ima bar 3, najgori s ostatkom > outlier_rms_mm se izbacuje i
    prilagodba ponavlja. Izbačeni ID-ovi su u rezultatu (dropped_ids) za upozorenje korisniku."""
    ids, corners = detect_markers(img_bgr, dict_name)
    if len(ids) < min_markers:
        raise RuntimeError(f"premalo markera: nađeno {len(ids)}, treba bar {min_markers}")
    dropped = []
    while True:
        fit = _fit_markers(ids, corners, marker_mm)
        worst = max(fit.per_marker_rms_mm, key=fit.per_marker_rms_mm.get)
        if len(ids) >= 3 and fit.per_marker_rms_mm[worst] > outlier_rms_mm:
            log.info("  marker %s izbačen: ostatak %.2f mm (nije u ravnini s ostalima)", worst, fit.per_marker_rms_mm[worst])
            dropped.append(int(worst))
            keep = ids != worst
            ids, corners = ids[keep], corners[keep]
            continue
        fit.dropped_ids = dropped
        return fit


def _fit_markers(ids, corners, marker_mm: float) -> PlaneFit:
    n = len(ids)
    # ---- početna homografija: iz svih markera odjednom uz grubi položaj iz najvećeg markera
    areas = [cv2.contourArea(c.astype(np.float32)) for c in corners]
    k0 = int(np.argmax(areas))
    H0, _ = cv2.findHomography(corners[k0], _square(marker_mm), 0)      # px -> mm, marker k0 u ishodištu
    poses = np.zeros((n, 3))
    for k in range(n):
        q = _apply_h(H0, corners[k])
        ctr = q.mean(0)
        v = q[1] - q[0]
        poses[k] = [ctr[0], ctr[1], np.arctan2(v[1], v[0])]
    # ---- zajednička prilagodba: H (8 parametara, h33 = 1) + (x, y, theta) po markeru
    h0 = (H0 / H0[2, 2]).ravel()[:8]
    x0 = np.concatenate([h0, poses.ravel()])
    allc = corners.reshape(-1, 2)

    def resid(x):
        H = np.append(x[:8], 1.0).reshape(3, 3)
        q = _apply_h(H, allc)
        tgt = np.vstack([_pose_square(*x[8 + 3 * k: 11 + 3 * k], marker_mm) for k in range(n)])
        return (q - tgt).ravel()

    sol = least_squares(resid, x0, method="lm", xtol=1e-12, ftol=1e-12, max_nfev=5000)
    H = np.append(sol.x[:8], 1.0).reshape(3, 3)
    r = resid(sol.x).reshape(-1, 2)
    d = np.hypot(r[:, 0], r[:, 1])
    poses = sol.x[8:].reshape(n, 3)
    # ---- orijentacija: y prema gore u tlocrtu; zadržavamo orijentaciju slike (x desno, y dolje)
    # da korisniku ispravljena slika izgleda kao fotografija. Mjerilo u sredini:
    ctr = allc.mean(0)
    e = _apply_h(H, np.array([ctr, ctr + [1, 0], ctr + [0, 1]]))
    mm_per_px = float((np.hypot(*(e[1] - e[0])) + np.hypot(*(e[2] - e[0]))) / 2)
    per = {int(ids[k]): float(np.sqrt((d[4 * k:4 * k + 4] ** 2).mean())) for k in range(n)}
    log.info("  markeri: %d (%s), ostatak RMS %.2f mm, max %.2f mm, %.3f mm/px", n, list(ids),
             np.sqrt((d ** 2).mean()), d.max(), mm_per_px)
    return PlaneFit(H_img_to_mm=H, ids=list(ids), corners_px=corners, poses_mm=poses,
                    rms_mm=float(np.sqrt((d ** 2).mean())), max_mm=float(d.max()), mm_per_px=mm_per_px,
                    per_marker_rms_mm=per)


# --------------------------------------------------------------------------- ispravljanje
def rectify_plane(img_bgr: np.ndarray, plane: PlaneFit, margin_mm: float = 100.0, max_mm: float = 3500.0):
    """Tlocrt 1 px = 1 mm. Područje = cijela fotografija preslikana u ravninu, ograničeno na
    max_mm x max_mm oko markera (rubovi fotografije daleko od ravnine nemaju smisla).
    Vraća (rect, origin_mm) gdje je mm = px_rect + origin_mm."""
    h, w = img_bgr.shape[:2]
    img_corners = plane.img_to_mm(np.array([[0, 0], [w, 0], [w, h], [0, h]], float))
    mk = plane.img_to_mm(plane.corners_px.reshape(-1, 2))
    c = mk.mean(0)
    lo = np.maximum(img_corners.min(0), c - max_mm / 2)
    hi = np.minimum(img_corners.max(0), c + max_mm / 2)
    lo = np.minimum(lo, mk.min(0) - margin_mm)
    hi = np.maximum(hi, mk.max(0) + margin_mm)
    lo = np.floor(lo); hi = np.ceil(hi)
    W, Hh = int(hi[0] - lo[0]), int(hi[1] - lo[1])
    T = np.array([[1, 0, -lo[0]], [0, 1, -lo[1]], [0, 0, 1]], float)
    rect = cv2.warpPerspective(img_bgr, T @ plane.H_img_to_mm, (W, Hh), flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    return rect, lo


# --------------------------------------------------------------------------- segmentacija
def segment_seed(rect_bgr: np.ndarray, seed_px, iters: int = 5, seed_r: int = 20, exclude_mask: np.ndarray | None = None,
                 tol: float = 14.0, ring_mm: int = 150):
    """Kontura elementa iz jednog dodira, u dva koraka:
    1. rast područja po boji (Lab) od dodira: sve što je slično boji oko dodira i povezano s njim;
    2. GrabCut dorada ruba: sigurna unutrašnjost = erodirano područje iz 1., vjerojatna pozadina =
       prsten širine ring_mm oko njega, sigurna pozadina = ostatak, markeri i crno (izvan fotografije).
    Vraća (polyline px (N,2) zatvoren, maska). Korisnik konturu potom popravlja prstom."""
    h, w = rect_bgr.shape[:2]
    sx, sy = int(seed_px[0]), int(seed_px[1])
    if not (0 <= sx < w and 0 <= sy < h):
        raise RuntimeError("dodir je izvan ispravljene slike")
    f = 0.5                                                   # rad na 1 px = 2 mm (brzina)
    small = cv2.resize(rect_bgr, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    hs, ws = small.shape[:2]
    px, py = int(sx * f), int(sy * f)
    valid = (small.sum(2) > 0).astype(np.uint8)
    excl = np.zeros((hs, ws), np.uint8)
    if exclude_mask is not None:
        excl = (cv2.resize(exclude_mask, (ws, hs), interpolation=cv2.INTER_NEAREST) > 0).astype(np.uint8)
    # ---- 1. rast po boji
    lab = cv2.cvtColor(cv2.GaussianBlur(small, (0, 0), 1.5), cv2.COLOR_BGR2Lab)
    r0 = int(seed_r * f)
    ref = np.median(lab[max(0, py - r0):py + r0 + 1, max(0, px - r0):px + r0 + 1].reshape(-1, 3), 0)
    dist = np.linalg.norm(lab.astype(np.float32) - ref.astype(np.float32), axis=2)
    sim = ((dist < tol) & (valid > 0) & (excl == 0)).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    sim = cv2.morphologyEx(sim, cv2.MORPH_CLOSE, k)
    n, lab_cc = cv2.connectedComponents(sim, connectivity=4)
    if lab_cc[py, px] == 0:
        raise RuntimeError("oko dodira nema jednolične površine (pokušaj dodir dalje od ruba)")
    reg0 = (lab_cc == lab_cc[py, px]).astype(np.uint8)
    reg0 = _fill_holes(reg0)
    # ---- 2. GrabCut dorada
    mask = np.full((hs, ws), cv2.GC_BGD, np.uint8)
    ring = int(ring_mm * f)
    kr = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * ring + 1, 2 * ring + 1))
    mask[cv2.dilate(reg0, kr) > 0] = cv2.GC_PR_BGD
    mask[reg0 > 0] = cv2.GC_PR_FGD
    ke = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(30 * f) * 2 + 1,) * 2)
    mask[cv2.erode(reg0, ke) > 0] = cv2.GC_FGD
    cv2.circle(mask, (px, py), max(2, r0), cv2.GC_FGD, -1)
    mask[(valid == 0) | (excl > 0)] = cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(small, mask, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
        fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    except cv2.error:                                         # npr. premalo pozadine u kadru
        fg = reg0
    n, lab_cc = cv2.connectedComponents(fg, connectivity=4)
    if lab_cc[py, px] == 0:
        fg = reg0
        n, lab_cc = cv2.connectedComponents(fg, connectivity=4)
    reg = (lab_cc == lab_cc[py, px]).astype(np.uint8) * 255
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    reg = cv2.morphologyEx(reg, cv2.MORPH_CLOSE, k2)
    reg = cv2.morphologyEx(reg, cv2.MORPH_OPEN, k2)
    reg = _fill_holes(reg)
    cnts, _ = cv2.findContours(reg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        raise RuntimeError("segmentacija nije dala konturu")
    c = max(cnts, key=cv2.contourArea).reshape(-1, 2).astype(float) / f
    c = c + 0.5 / f - 0.5                                    # središte piksela male slike -> pune
    # rub na pola prijelaza boje (na punoj rezoluciji), uzorkovano svaka 2 mm
    from .contour import resample_closed, ensure_ccw
    c = refine_contour_edges(rect_bgr, ensure_ccw(resample_closed(c, 2.0)))
    full = cv2.resize(reg, (w, h), interpolation=cv2.INTER_NEAREST)
    return c, full


def _fill_holes(m: np.ndarray) -> np.ndarray:
    """Popunjava rupe u binarnoj maski (0/1 ili 0/255) zadržavajući vrijednost 'uključeno'."""
    on = m.max() if m.max() else 1
    inv = (m == 0).astype(np.uint8)
    n, lab = cv2.connectedComponents(inv, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    holes = np.isin(lab, [i for i in range(1, n) if i not in border])
    out = m.copy()
    out[holes] = on
    return out


def markers_mask(rect_bgr: np.ndarray, plane: PlaneFit, origin_mm, pad_mm: float = 12.0) -> np.ndarray:
    """Maska kartica markera u ispravljenoj slici (da ih segmentacija ne uzme kao dio elementa)."""
    m = np.zeros(rect_bgr.shape[:2], np.uint8)
    for c in plane.corners_px:
        q = plane.img_to_mm(c) - origin_mm
        ctr = q.mean(0)
        q = ctr + (q - ctr) * (1 + 2 * pad_mm / np.hypot(*(q[1] - q[0])))
        cv2.fillConvexPoly(m, np.round(q).astype(np.int32), 255)
    return m
