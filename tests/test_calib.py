"""Kalibracija kamere na sintetičkim fotografijama šahovnice poznate kamere; položaj kamere iz
homografije; korekcija paralakse za rub ispod ravnine markera."""
import numpy as np
import cv2
import pytest

from jastuk_cv import calib as CB


def board_image(pattern=(6, 9), square_px=60):
    cols, rows = pattern[0] + 1, pattern[1] + 1
    img = np.full((rows * square_px + 2 * square_px, cols * square_px + 2 * square_px), 255, np.uint8)
    for r in range(rows):
        for c in range(cols):
            if (r + c) % 2 == 0:
                y0, x0 = square_px * (r + 1), square_px * (c + 1)
                img[y0:y0 + square_px, x0:x0 + square_px] = 0
    return img


def project(K, R, t, pts3):
    p = (R @ pts3.T + t[:, None])
    p = K @ p
    return (p[:2] / p[2]).T


def synth_photo(K, R, t, size=(1600, 1200), pattern=(6, 9), square_mm=25.0):
    """Šahovnica u ravnini z=0 (mm), slikana kamerom K, R, t -> fotografija (warpPerspective)."""
    sq_px = 40
    board = board_image(pattern, sq_px)
    # koordinate ploče: unutarnji kut (0,0) mm je na pikselu (2*sq_px, 2*sq_px)
    src = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]]) * 200 * sq_px / square_mm  # px ploče za 200 mm
    src += 2 * sq_px
    dst = project(K, R, t, np.array([[0, 0, 0], [200, 0, 0], [200, 200, 0], [0, 200, 0]], float)).astype(np.float32)
    H = cv2.getPerspectiveTransform(src, dst)
    img = cv2.warpPerspective(board, H, size, borderValue=255)
    return cv2.GaussianBlur(img, (0, 0), 0.8)


def rot(ax, ay, az):
    return cv2.Rodrigues(np.array([ax, ay, az], float))[0]


def test_calibrate_recovers_K():
    K = np.array([[1400.0, 0, 800], [0, 1400.0, 600], [0, 0, 1]])
    imgs = []
    rng = np.random.default_rng(1)
    for i in range(10):
        R = rot(*(rng.uniform(-0.4, 0.4, 3)))
        t = np.array([rng.uniform(-60, -20), rng.uniform(-60, -20), rng.uniform(600, 900)])
        imgs.append(synth_photo(K, R, t))
    c = CB.calibrate(imgs)
    assert c["n_images"] >= 8 and c["rms_px"] < 0.5
    Kc = np.array(c["K"])
    assert Kc[0, 0] == pytest.approx(1400, rel=0.02) and Kc[1, 1] == pytest.approx(1400, rel=0.02)
    assert Kc[0, 2] == pytest.approx(800, abs=15) and Kc[1, 2] == pytest.approx(600, abs=15)
    assert max(abs(x) for x in c["dist"]) < 0.05
    with pytest.raises(RuntimeError):
        CB.calibrate(imgs[:3])


def test_camera_pose_and_parallax():
    K = np.array([[1400.0, 0, 800], [0, 1400.0, 600], [0, 0, 1]])
    R = rot(0.25, -0.15, 0.1)
    t = np.array([-300.0, -200.0, 1500.0])
    # homografija ravnine z=0 -> slika, pa inverz kao "fit" (kao iz markera)
    Hmm_px = K @ np.stack([R[:, 0], R[:, 1], t], 1)
    H_img_to_mm = np.linalg.inv(Hmm_px / Hmm_px[2, 2])
    R2, t2 = CB.camera_from_homography(H_img_to_mm, K)
    assert np.allclose(R2, R, atol=1e-6) and np.allclose(t2, t, atol=1e-3)
    # rub 30 mm ispod ravnine: njegove slikovne točke kroz homografiju ravnine daju krive (X,Y);
    # korekcija ih vraća na istinu
    truth = np.array([[100, 50], [900, 80], [950, 600], [80, 550]], float)
    drop = 30.0
    px = project(K, R, t, np.column_stack([truth, -drop * np.ones(len(truth))]))
    wrong = cv2.perspectiveTransform(px.reshape(-1, 1, 2), H_img_to_mm).reshape(-1, 2)
    assert np.abs(wrong - truth).max() > 5            # paralaksa je vidljiva (mm)
    fixed = CB.correct_edge_drop(wrong, H_img_to_mm, K, drop)
    assert np.abs(fixed - truth).max() < 0.05
    assert np.allclose(CB.correct_edge_drop(wrong, H_img_to_mm, K, 0.0), wrong)


def test_undistort_and_store(tmp_path):
    K = [[1400.0, 0, 800], [0, 1400.0, 600], [0, 0, 1]]
    c = dict(K=K, dist=[0.05, -0.02, 0, 0], image_size=[1600, 1200])
    img = np.full((1200, 1600, 3), 128, np.uint8)
    assert CB.undistort(img, c).shape == img.shape
    assert CB.undistort(np.full((600, 800, 3), 128, np.uint8), c).shape == (600, 800, 3)   # ista kamera, pola rezolucije
    CB.save_calib(tmp_path, "Samsung SM-S938B 4000x3000", c)
    assert CB.load_calib(tmp_path, "Samsung SM-S938B 4000x3000")["K"] == K
    assert CB.load_calib(tmp_path, None) is None and CB.load_calib(tmp_path, "nema") is None
    assert len(CB.list_calibs(tmp_path)) == 1
    assert CB.image_key(img, "x") == "x 1600x1200"
