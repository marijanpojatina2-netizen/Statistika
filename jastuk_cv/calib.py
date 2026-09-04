"""Kalibracija kamere (šahovnica iz markeri/kalibracija_sahovnica_a4.pdf) i što s njom radimo:
  1. undistort: uklanjanje distorzije leće prije detekcije mreže/markera (obje metode),
  2. položaj kamere iz homografije ravnine (K poznat) -> korekcija paralakse za rub elementa koji
     je `drop_mm` ISPOD ravnine markera (zaobljen rub jastuka, keder).

Kalibracija se čuva po uređaju: ključ = Make/Model iz EXIF-a + širina x visina slike (fotografije iz
druge kamere/rezolucije istog telefona imaju drugi ključ).
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

PATTERN = (6, 9)       # unutarnji kutovi šahovnice iz tools/make_markers.py (7 x 10 polja)
SQUARE_MM = 25.0


# --------------------------------------------------------------------------- ključ uređaja
def exif_key(path_or_bytes) -> str | None:
    """'Make Model WxH' iz EXIF-a (Pillow), None ako nema EXIF-a."""
    try:
        from PIL import Image, ExifTags
        im = Image.open(path_or_bytes)
        ex = im.getexif()
        make = str(ex.get(271, "")).strip()
        model = str(ex.get(272, "")).strip()
        if not (make or model):
            return None
        w, h = im.size
        orient = ex.get(274, 1)
        if orient in (5, 6, 7, 8):
            w, h = h, w
        return f"{make} {model} {w}x{h}".strip()
    except Exception:                                      # noqa: BLE001
        return None


def image_key(img: np.ndarray, prefix: str = "nepoznat") -> str:
    h, w = img.shape[:2]
    return f"{prefix} {w}x{h}"


# --------------------------------------------------------------------------- kalibracija
def find_corners(gray: np.ndarray, pattern=PATTERN):
    ok, c = cv2.findChessboardCorners(gray, pattern, cv2.CALIB_CB_ADAPTIVE_THRESH | cv2.CALIB_CB_NORMALIZE_IMAGE)
    if not ok:
        return None
    c = cv2.cornerSubPix(gray, c, (11, 11), (-1, -1), (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 1e-4))
    return c


def calibrate(images: list[np.ndarray], pattern=PATTERN, square_mm: float = SQUARE_MM) -> dict:
    """Iz N fotografija šahovnice -> K, koeficijenti distorzije, RMS reprojekcije (px)."""
    objp = np.zeros((pattern[0] * pattern[1], 3), np.float32)
    objp[:, :2] = np.mgrid[0:pattern[0], 0:pattern[1]].T.reshape(-1, 2) * square_mm
    obj, imgp, used = [], [], []
    size = None
    for i, img in enumerate(images):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
        size = (gray.shape[1], gray.shape[0])
        c = find_corners(gray, pattern)
        if c is None:
            continue
        obj.append(objp); imgp.append(c); used.append(i)
    if len(obj) < 5:
        raise RuntimeError(f"šahovnica nađena na {len(obj)} od {len(images)} fotografija, treba bar 5")
    rms, K, dist, _, _ = cv2.calibrateCamera(obj, imgp, size, None, None,
                                            flags=cv2.CALIB_FIX_K3 | cv2.CALIB_ZERO_TANGENT_DIST)
    return dict(K=K.tolist(), dist=dist.ravel().tolist(), rms_px=float(rms), image_size=list(size),
                n_images=len(obj), used=used)


def undistort(img: np.ndarray, calib: dict) -> np.ndarray:
    K = np.asarray(calib["K"], float)
    dist = np.asarray(calib["dist"], float)
    h, w = img.shape[:2]
    cw, ch = calib.get("image_size", [w, h])
    if (cw, ch) != (w, h):                                  # ista kamera, druga rezolucija: skaliraj K
        s = w / cw
        K = K.copy(); K[0] *= s; K[1] *= s
    return cv2.undistort(img, K, dist, None, K)


# --------------------------------------------------------------------------- spremište
def store_dir(var: Path) -> Path:
    d = Path(var) / "calib"
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_calib(var: Path, key: str, calib: dict):
    (store_dir(var) / (_safe(key) + ".json")).write_text(json.dumps(dict(calib, key=key), indent=1), encoding="utf-8")


def load_calib(var: Path, key: str | None) -> dict | None:
    if not key:
        return None
    f = store_dir(var) / (_safe(key) + ".json")
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


def list_calibs(var: Path) -> list:
    return [json.loads(f.read_text(encoding="utf-8")) for f in sorted(store_dir(var).glob("*.json"))]


def _safe(key: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in key)


# --------------------------------------------------------------------------- položaj kamere i paralaksa
def camera_from_homography(H_img_to_mm: np.ndarray, K: np.ndarray):
    """Iz homografije ravnina(mm, z=0) -> slika i K: R, t kamere (ravnina u koordinatama kamere).
    Vraća (R, t) tako da je x_cam = R @ [X, Y, 0] + t."""
    H = np.linalg.inv(H_img_to_mm)                          # mm -> px
    M = np.linalg.inv(K) @ H
    s = 1.0 / np.linalg.norm(M[:, 0])
    if M[2, 2] * s < 0:
        s = -s                                              # kamera je ispred ravnine
    r1, r2, t = M[:, 0] * s, M[:, 1] * s, M[:, 2] * s
    r3 = np.cross(r1, r2)
    R = np.stack([r1, r2, r3], 1)
    U, _, Vt = np.linalg.svd(R)                             # najbliža rotacija
    R = U @ Vt
    if np.linalg.det(R) < 0:
        R[:, 2] *= -1
    return R, t


def correct_edge_drop(pts_mm: np.ndarray, H_img_to_mm: np.ndarray, K: np.ndarray, drop_mm: float) -> np.ndarray:
    """Točke ruba su viđene u slici, a leže `drop_mm` ISPOD ravnine markera (z = -drop). Homografija ih
    je krivo položila u z = 0; ovdje se zraka kamera->točka presiječe s ravninom z = -drop i vrati u
    (X, Y). Pozitivan drop = rub niže od markera (dalje od kamere)."""
    if abs(drop_mm) < 1e-9:
        return np.asarray(pts_mm, float)
    R, t = camera_from_homography(H_img_to_mm, K)
    C = -R.T @ t                                            # središte kamere u koordinatama ravnine (X, Y, Z)
    out = []
    for X, Y in np.asarray(pts_mm, float):
        P = np.array([X, Y, 0.0])
        d = P - C                                           # smjer zrake od kamere kroz točku na z = 0
        if abs(d[2]) < 1e-9:
            out.append([X, Y]); continue
        lam = (-drop_mm - C[2]) / d[2]                      # presjek sa z = -drop
        Q = C + lam * d
        out.append([Q[0], Q[1]])
    return np.array(out)
