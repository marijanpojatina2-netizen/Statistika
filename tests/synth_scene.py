"""Sintetička 'fotografija' za testove metode B: siva ravnina s 6 ArUco markera (80 mm, nasumično
zakrenuti) i tamnim zaobljenim jastukom 1200 x 600 mm, snimljena pod perspektivom, zamućena.
Vraća fotografiju, istinski obris (mm ravnine), dodir u slici i perspektivu Hp (ravnina px -> slika)."""
import numpy as np
import cv2

def make_scene(seed=0, marker_mm=80.0, n_markers=6, out_px=(3000, 4000)):
    rng = np.random.default_rng(seed)
    W, H = 1800, 2400                       # mm ravnine
    S = 2                                   # px/mm u "ravnini" prije perspektive
    plane = np.full((H * S, W * S, 3), 200, np.uint8)     # sivi ležaj
    noise = rng.integers(-12, 12, plane.shape, dtype=np.int16)
    plane = np.clip(plane.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    # jastuk: zaobljeni pravokutnik 1200 x 600 mm, tamnoplav, malo zakrenut
    cx, cy, w, h, r, ang = 900, 1200, 1200, 600, 80, 7
    pts = []
    for cxx, cyy, a0 in ((w/2-r, h/2-r, 0), (-w/2+r, h/2-r, 90), (-w/2+r, -h/2+r, 180), (w/2-r, -h/2+r, 270)):
        for a in np.linspace(a0, a0+90, 20, endpoint=False):
            pts.append((cxx + r*np.cos(np.radians(a)), cyy + r*np.sin(np.radians(a))))
    pts = np.array(pts)
    c, s = np.cos(np.radians(ang)), np.sin(np.radians(ang))
    truth = pts @ np.array([[c, s], [-s, c]]) + [cx, cy]        # mm, ravnina (x desno, y dolje)
    cv2.fillPoly(plane, [np.round(truth * S).astype(np.int32)], (90, 40, 20))
    # markeri oko jastuka
    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_5X5_50)
    spots = [(150, 150), (1650, 200), (200, 2200), (1600, 2250), (900, 350), (1650, 1200)][:n_markers]
    marker_truth = []
    for i, (mx, my) in enumerate(spots):
        th = rng.uniform(0, 2*np.pi)
        img = cv2.aruco.generateImageMarker(d, i, 7 * 40)                                  # 80 mm = 280 px (3.5 px/mm)
        card = cv2.copyMakeBorder(img, 35, 35, 35, 35, cv2.BORDER_CONSTANT, value=255)   # + 10 mm rub = 100 mm kartica
        # kartica u ravninu: 100 mm = 100*S px
        src = np.array([[0, 0], [card.shape[1], 0], [card.shape[1], card.shape[0]], [0, card.shape[0]]], float)
        half = 50 * S
        cc, ss = np.cos(th), np.sin(th)
        dst = np.array([[-half, -half], [half, -half], [half, half], [-half, half]]) @ np.array([[cc, ss], [-ss, cc]]) + [mx * S, my * S]
        M = cv2.getPerspectiveTransform(src.astype(np.float32), dst.astype(np.float32))
        mk = np.array([[35, 35], [315, 35], [315, 315], [35, 315]], float) - 0.5      # uglovi markera u kartici (rub piksela)
        marker_truth.append(cv2.perspectiveTransform(mk.reshape(-1, 1, 2), M).reshape(-1, 2) / S)   # mm ravnine
        warped = cv2.warpPerspective(cv2.cvtColor(card, cv2.COLOR_GRAY2BGR), M, (W * S, H * S), borderValue=(0, 0, 0))
        cover = cv2.warpPerspective(np.full(card.shape, 255, np.uint8), M, (W * S, H * S), borderValue=0)
        m = cover > 127
        plane[m] = warped[m]
    make_scene.plane = plane
    # perspektiva: kamera malo nagnuta; H: ravnina px -> slika px
    ow, oh = out_px
    src = np.array([[0, 0], [W*S, 0], [W*S, H*S], [0, H*S]], np.float32)
    dst = np.array([[ow*0.12, oh*0.06], [ow*0.90, oh*0.10], [ow*0.97, oh*0.95], [ow*0.05, oh*0.90]], np.float32)
    Hp = cv2.getPerspectiveTransform(src, dst)
    photo = cv2.warpPerspective(plane, Hp, (ow, oh), flags=cv2.INTER_AREA, borderValue=(60, 60, 60))
    photo = cv2.GaussianBlur(photo, (0, 0), 1.2)
    seed_plane = np.array([[cx, cy]]) * S
    seed_px = cv2.perspectiveTransform(seed_plane.reshape(-1, 1, 2).astype(np.float64), Hp).reshape(2)
    make_scene.marker_truth = np.array(marker_truth)
    return photo, truth, seed_px, Hp, S

