"""REST rute: brodovi, poslovi, elementi, fotografije, mjerenje (metoda A), izvoz."""
from __future__ import annotations

import json
import logging
import uuid
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select, or_

from jastuk_cv import measure_grid, outputs
from jastuk_cv.markers import fit_plane, rectify_plane, segment_seed, markers_mask
from jastuk_cv.measure import finish_polyline
from jastuk_cv import features as FT
from jastuk_cv import pattern as PT
from jastuk_cv import kroj_out
from jastuk_cv import nesting as NEST
from jastuk_cv import calib as CB
from jastuk_cv import quote as QT
from . import auth, db
from .models import BoatModel, Element, Job, Measurement

log = logging.getLogger("jastuk_api")
router = APIRouter()
PREVIEW_MAX = 1600


# --------------------------------------------------------------------------- brodovi
@router.get("/boats")
def list_boats(q: str = "", session: Session = Depends(db.get_session)):
    st = select(BoatModel)
    for w in q.split():
        st = st.where(or_(BoatModel.builder.ilike(f"%{w}%"), BoatModel.model.ilike(f"%{w}%")))
    st = st.order_by(BoatModel.priority.is_(None), BoatModel.priority, BoatModel.builder, BoatModel.model)
    return session.exec(st.limit(50)).all()


class BoatIn(BaseModel):
    builder: str
    model: str
    type: str = "jedrilica"
    loa_m: float = 12.0
    beam_m: float = 4.0
    year_from: int = 2015
    year_to: Optional[int] = None
    cabins: str = ""


@router.post("/boats")
def create_boat(b: BoatIn, session: Session = Depends(db.get_session)):
    boat = BoatModel(**b.model_dump())
    session.add(boat)
    session.commit()
    session.refresh(boat)
    return boat


# --------------------------------------------------------------------------- poslovi
class JobIn(BaseModel):
    boat_model_id: Optional[int] = None
    boat_name: str = ""
    customer: str = ""
    marina: str = ""
    notes: str = ""
    status: Optional[str] = None


def _job_out(session: Session, job: Job) -> dict:
    boat = session.get(BoatModel, job.boat_model_id) if job.boat_model_id else None
    elems = session.exec(select(Element).where(Element.job_id == job.id).order_by(Element.id)).all()
    return dict(job=job, boat=boat, elements=elems)


@router.get("/jobs")
def list_jobs(session: Session = Depends(db.get_session)):
    jobs = session.exec(select(Job).order_by(Job.id.desc())).all()
    out = []
    for j in jobs:
        boat = session.get(BoatModel, j.boat_model_id) if j.boat_model_id else None
        n = len(session.exec(select(Element.id).where(Element.job_id == j.id)).all())
        out.append(dict(job=j, boat=boat, n_elements=n))
    return out


@router.post("/jobs")
def create_job(j: JobIn, session: Session = Depends(db.get_session), user: str = auth.UserDep):
    job = Job(**{k: v for k, v in j.model_dump().items() if v is not None}, created_by=user)
    session.add(job)
    session.commit()
    session.refresh(job)
    return _job_out(session, job)


@router.get("/jobs/{job_id}")
def get_job(job_id: int, session: Session = Depends(db.get_session)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "posao ne postoji")
    return _job_out(session, job)


@router.patch("/jobs/{job_id}")
def update_job(job_id: int, j: JobIn, session: Session = Depends(db.get_session)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "posao ne postoji")
    for k, v in j.model_dump(exclude_unset=True).items():
        setattr(job, k, v)
    session.add(job)
    session.commit()
    return _job_out(session, job)


@router.delete("/jobs/{job_id}")
def delete_job(job_id: int, session: Session = Depends(db.get_session)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "posao ne postoji")
    for e in session.exec(select(Element).where(Element.job_id == job_id)).all():
        session.delete(e)
    session.delete(job)
    session.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- predlošci po modelu broda
@router.get("/boats/{boat_id}/templates")
def boat_templates(boat_id: int, session: Session = Depends(db.get_session)):
    """Poslovi istog modela broda koji imaju elemente: kandidati za predložak novog posla."""
    jobs = session.exec(select(Job).where(Job.boat_model_id == boat_id).order_by(Job.id.desc())).all()
    out = []
    for j in jobs:
        els = session.exec(select(Element).where(Element.job_id == j.id)).all()
        if not els:
            continue
        out.append(dict(job_id=j.id, boat_name=j.boat_name, customer=j.customer, created_at=j.created_at,
                        n_elements=len(els), n_measured=sum(1 for e in els if e.outline_mm)))
    return out


class CopyIn(BaseModel):
    from_job_id: int
    with_outlines: bool = True     # obris izvora kao nominalni predložak (za usporedbu i "preuzmi")


@router.post("/jobs/{job_id}/copy_elements")
def copy_elements(job_id: int, c: CopyIn, session: Session = Depends(db.get_session)):
    """Preuzmi elemente (šifre, zone, skice, debljine, dodaci) iz ranijeg posla istog modela. Obrisi
    izvora postaju predložak (template_outline_mm), nikad izravno izmjereni obris."""
    job = session.get(Job, job_id)
    src = session.get(Job, c.from_job_id)
    if not job or not src:
        raise HTTPException(404, "posao ne postoji")
    if job.boat_model_id != src.boat_model_id:
        raise HTTPException(422, "poslovi nisu istog modela broda")
    existing = {e.code for e in session.exec(select(Element).where(Element.job_id == job_id)).all()}
    n = 0
    for e in session.exec(select(Element).where(Element.job_id == src.id).order_by(Element.id)).all():
        if e.code in existing:
            continue
        session.add(Element(job_id=job_id, code=e.code, name=e.name, zone=e.zone, kind=e.kind, thickness_mm=e.thickness_mm,
                            notes=e.notes, sketch=e.sketch, features=e.features, status="nacrtan",
                            template_outline_mm=e.outline_mm if c.with_outlines else None, template_from=e.id))
        n += 1
    session.commit()
    return dict(copied=n, from_job_id=src.id)


@router.post("/elements/{el_id}/use_template")
def use_template(el_id: int, session: Session = Depends(db.get_session)):
    """Preuzmi nominalni obris predloška kao obris elementa (isti model, isti jastuk, bez mjerenja)."""
    el = session.get(Element, el_id)
    if not el or not el.template_outline_mm:
        raise HTTPException(404, "element nema predložak")
    el.outline_mm = _clean_outline(el.template_outline_mm)
    el.method = "template"
    el.status = "potvrđen"
    session.add(el)
    session.commit()
    session.refresh(el)
    return el


def template_deviation(outline, template) -> Optional[dict]:
    """Odstupanje izmjerenog obrisa od predloška nakon poravnanja (translacija + zakret po minAreaRect):
    najveća udaljenost ruba u mm i razlika gabarita. None ako nema predloška."""
    if not outline or not template:
        return None
    a = np.asarray(outline, float)
    b = np.asarray(template, float)
    ra, rb = cv2.minAreaRect(a.astype(np.float32)), cv2.minAreaRect(b.astype(np.float32))
    best = None
    for extra in (0, 90, 180, 270):
        ang = np.radians(rb[2] + extra - ra[2])
        R = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
        q = (a - ra[0]) @ R.T + rb[0]
        d = np.array([abs(cv2.pointPolygonTest(b.astype(np.float32), (float(x), float(y)), True)) for x, y in q[::max(1, len(q) // 200)]])
        if best is None or d.max() < best[0]:
            best = (float(d.max()), float(d.mean()))
    da, db_ = sorted(ra[1]), sorted(rb[1])
    size_diff = [round(da[0] - db_[0], 1), round(da[1] - db_[1], 1)]
    return dict(max_mm=round(best[0], 1), mean_mm=round(best[1], 1), size_diff_mm=size_diff,
                warn=best[0] > 10 or max(abs(x) for x in size_diff) > 20)


# --------------------------------------------------------------------------- elementi
class ElementIn(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    zone: Optional[str] = None
    kind: Optional[str] = None
    thickness_mm: Optional[int] = None
    notes: Optional[str] = None
    sketch: Optional[list] = None
    outline_mm: Optional[list] = None
    features: Optional[list] = None
    status: Optional[str] = None
    method: Optional[str] = None


# --------------------------------------------------------------------------- pravila radionice
def load_rules() -> dict:
    f = db.VAR / "rules.json"
    return PT.merge_rules(json.loads(f.read_text(encoding="utf-8")) if f.exists() else None)


@router.get("/rules")
def get_rules():
    r = load_rules()
    return dict(r, cjenik_full=QT.prices(r), radionica_full=QT.workshop(r))


@router.put("/rules")
def put_rules(rules: dict):
    merged = PT.merge_rules(rules)
    (db.VAR / "rules.json").write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
    return merged


@router.get("/feature_types")
def feature_types():
    """Tipovi dodataka (cif, keder, kopča...) s geometrijom i zadanim parametrima, za sučelje."""
    return [dict(type=k, name=v[0], geom=v[1], defaults=v[2]) for k, v in FT.TYPES.items()]


@router.post("/jobs/{job_id}/elements")
def create_element(job_id: int, e: ElementIn, session: Session = Depends(db.get_session)):
    if not session.get(Job, job_id):
        raise HTTPException(404, "posao ne postoji")
    el = Element(job_id=job_id, **{k: v for k, v in e.model_dump().items() if v is not None})
    session.add(el)
    session.commit()
    session.refresh(el)
    return el


@router.get("/elements/{el_id}")
def get_element(el_id: int, session: Session = Depends(db.get_session)):
    el = session.get(Element, el_id)
    if not el:
        raise HTTPException(404, "element ne postoji")
    m = session.get(Measurement, el.measurement_id) if el.measurement_id else None
    job = session.get(Job, el.job_id)
    boat = session.get(BoatModel, job.boat_model_id) if job and job.boat_model_id else None
    return dict(element=el, measurement=m, job=job, boat=boat,
                template_deviation=template_deviation(el.outline_mm, el.template_outline_mm))


@router.patch("/elements/{el_id}")
def update_element(el_id: int, e: ElementIn, session: Session = Depends(db.get_session)):
    el = session.get(Element, el_id)
    if not el:
        raise HTTPException(404, "element ne postoji")
    data = e.model_dump(exclude_unset=True)
    if data.get("features") is not None:
        data["features"] = _clean_features(data["features"])
    if "outline_mm" in data and data["outline_mm"] is not None:
        data["outline_mm"] = _clean_outline(data["outline_mm"])
        data.setdefault("status", "potvrđen")
        data.setdefault("method", el.method or "manual")
    for k, v in data.items():
        setattr(el, k, v)
    session.add(el)
    session.commit()
    session.refresh(el)
    return el


@router.delete("/elements/{el_id}")
def delete_element(el_id: int, session: Session = Depends(db.get_session)):
    el = session.get(Element, el_id)
    if not el:
        raise HTTPException(404, "element ne postoji")
    session.delete(el)
    session.commit()
    return {"ok": True}


def _clean_features(feats) -> list:
    out = []
    for i, f in enumerate(feats):
        t = f.get("type")
        if t not in FT.TYPES:
            raise HTTPException(422, f"nepoznat tip dodatka: {t}")
        g = dict(id=f.get("id") or f"f{i + 1}", type=t, params={**FT.TYPES[t][2], **(f.get("params") or {})})
        if FT.TYPES[t][1] == "edge":
            if "s0" not in f or "s1" not in f:
                raise HTTPException(422, f"rubni dodatak {t} treba s0 i s1")
            g["s0"], g["s1"] = round(float(f["s0"]), 1), round(float(f["s1"]), 1)
        else:
            if "p" not in f:
                raise HTTPException(422, f"točkasti dodatak {t} treba p")
            g["p"] = [round(float(f["p"][0]), 1), round(float(f["p"][1]), 1)]
        out.append(g)
    return out


def _clean_outline(pts) -> list:
    p = np.asarray(pts, float).reshape(-1, 2)
    if len(p) < 3:
        raise HTTPException(422, "obris treba bar 3 točke")
    x, y = p[:, 0], p[:, 1]
    if 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y) < 0:
        p = p[::-1]
    p = p - p.min(0)                      # donji lijevi kut gabarita u (0, 0): čitljive koordinate dodataka
    return np.round(p, 2).tolist()


# --------------------------------------------------------------------------- fotografije
@router.post("/photos")
async def upload_photo(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) < 1000:
        raise HTTPException(422, "prazna datoteka")
    pid = uuid.uuid4().hex
    path = db.PHOTOS / f"{pid}.jpg"
    path.write_bytes(data)
    img = cv2.imread(str(path))          # poštuje EXIF orijentaciju; mjerenje čita isto tako
    if img is None:
        path.unlink(missing_ok=True)
        raise HTTPException(422, "datoteka nije slika")
    h, w = img.shape[:2]
    s = min(1.0, PREVIEW_MAX / max(h, w))
    prev = cv2.resize(img, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA) if s < 1 else img
    cv2.imwrite(str(db.PHOTOS / f"{pid}_p.jpg"), prev, [cv2.IMWRITE_JPEG_QUALITY, 85])
    key = CB.exif_key(str(path))
    return dict(photo_id=pid, width=w, height=h, preview_url=f"/files/photos/{pid}_p.jpg",
                preview_width=prev.shape[1], preview_height=prev.shape[0],
                device_key=key, calibrated=CB.load_calib(db.VAR, key) is not None)


def _load_photo(photo_id: str, calib_key: Optional[str] = None):
    """Fotografija za mjerenje: ako za uređaj (EXIF) ili zadani ključ postoji kalibracija, ukloni distorziju."""
    path = db.PHOTOS / f"{photo_id}.jpg"
    if not path.exists():
        raise HTTPException(404, "fotografija ne postoji")
    img = cv2.imread(str(path))
    key = calib_key or CB.exif_key(str(path))
    cal = CB.load_calib(db.VAR, key)
    if cal:
        img = CB.undistort(img, cal)
    return img, cal, key


# --------------------------------------------------------------------------- kalibracija kamere
@router.post("/calib")
async def calibrate_camera(files: list[UploadFile] = File(...), key: str = ""):
    """15-20 fotografija šahovnice (markeri/kalibracija_sahovnica_a4.pdf) -> K i distorzija za uređaj.
    Ključ = EXIF prve fotografije (Make Model WxH) ili zadani `key`."""
    imgs, first = [], None
    for f in files:
        data = await f.read()
        arr = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if arr is None:
            continue
        if first is None:
            import io
            first = CB.exif_key(io.BytesIO(data))
            # imdecode ne poštuje EXIF orijentaciju: kalibracija radi u orijentaciji senzora, ključ po EXIF-u
        imgs.append(arr)
    key = key or first or (CB.image_key(imgs[0]) if imgs else "")
    if not imgs:
        raise HTTPException(422, "nema slika")
    try:
        cal = CB.calibrate(imgs)
    except RuntimeError as ex:
        raise HTTPException(422, str(ex))
    CB.save_calib(db.VAR, key, cal)
    return dict(key=key, **cal)


@router.get("/calib")
def list_calibrations():
    return [dict(key=c["key"], rms_px=round(c["rms_px"], 3), n_images=c["n_images"], image_size=c["image_size"]) for c in CB.list_calibs(db.VAR)]


# --------------------------------------------------------------------------- mjerenje (metoda A)
class MeasureIn(BaseModel):
    photo_id: str
    origin_px: tuple[float, float]
    x_axis_px: tuple[float, float]
    seed_px: tuple[float, float]
    square_corner_cm: Optional[tuple[float, float]] = None
    px_per_cm: Optional[float] = None


@router.post("/elements/{el_id}/measure")
def measure_element(el_id: int, m: MeasureIn, session: Session = Depends(db.get_session), user: str = auth.UserDep):
    el = session.get(Element, el_id)
    if not el:
        raise HTTPException(404, "element ne postoji")
    img, cal, key = _load_photo(m.photo_id)
    try:
        res = measure_grid(img, m.origin_px, x_axis_px=m.x_axis_px, seed_px=m.seed_px,
                           square_corner_cm=m.square_corner_cm, px_per_cm=m.px_per_cm)
    except Exception as ex:                                  # noqa: BLE001
        log.exception("mjerenje nije uspjelo")
        raise HTTPException(422, f"mjerenje nije uspjelo: {ex}")
    ctl = res.control_images(img)
    cv2.imwrite(str(db.PHOTOS / f"{m.photo_id}_ctl.jpg"), ctl["rectified"], [cv2.IMWRITE_JPEG_QUALITY, 80])
    cv2.imwrite(str(db.PHOTOS / f"{m.photo_id}_rect.jpg"), res.rect, [cv2.IMWRITE_JPEG_QUALITY, 75])
    outline_px = res.grid.cm_to_px(res.poly_mm / 10.0)
    d = res.to_dict()
    # ispravljena slika: 1 px = 1 mm; x_mm = u + 10*xr0, y_mm = -v + 10*yr1 (y papira prema gore)
    rect_to_mm = [[1, 0, 10.0 * res.x_range[0]], [0, -1, 10.0 * res.y_range[1]]]
    meas = Measurement(element_id=el.id, method="grid", photo_id=m.photo_id, params=m.model_dump(),
                       outline_mm=d["poly_mm"], corners=d["corners"], quality=d["quality"], perimeter_mm=res.perimeter_mm,
                       created_by=user)
    session.add(meas)
    session.commit()
    session.refresh(meas)
    return dict(measurement_id=meas.id, method="grid", outline_mm=d["poly_mm"], outline_px=np.round(outline_px, 1).tolist(),
                perimeter_mm=d["perimeter_mm"], bbox_mm=d["bbox_mm"], corners=d["corners"], quality=d["quality"],
                control_url=f"/files/photos/{m.photo_id}_ctl.jpg",
                rect_url=f"/files/photos/{m.photo_id}_rect.jpg", rect_size=[res.rect.shape[1], res.rect.shape[0]],
                rect_to_mm=rect_to_mm)


# --------------------------------------------------------------------------- mjerenje (metoda B: markeri)
class MeasureMarkersIn(BaseModel):
    photo_id: str
    seed_px: tuple[float, float]
    marker_mm: float = 80.0
    dict_name: str = "DICT_5X5_50"
    edge_drop_mm: float = 0.0          # rub elementa toliko mm ISPOD ravnine markera (zaobljen rub, keder); treba kalibraciju
    calib_key: Optional[str] = None    # ručno zadani ključ kalibracije (inače iz EXIF-a)


@router.post("/elements/{el_id}/measure_markers")
def measure_element_markers(el_id: int, m: MeasureMarkersIn, session: Session = Depends(db.get_session), user: str = auth.UserDep):
    """Fotografija odozgo s ArUco markerima + jedan dodir unutar elementa -> obris u mm i ispravljena
    slika (1 px = 1 mm) na kojoj korisnik prstom popravlja konturu."""
    el = session.get(Element, el_id)
    if not el:
        raise HTTPException(404, "element ne postoji")
    img, cal, key = _load_photo(m.photo_id, m.calib_key)
    if m.edge_drop_mm and not cal:
        raise HTTPException(422, f"korekcija za rub ispod ravnine traži kalibraciju kamere (uređaj: {key or 'nepoznat'})")
    try:
        plane = fit_plane(img, m.marker_mm, m.dict_name)
        rect, origin = rectify_plane(img, plane)
        seed_rect = plane.img_to_mm(m.seed_px)[0] - origin
        poly_px, _ = segment_seed(rect, seed_rect, exclude_mask=markers_mask(rect, plane, origin))
    except Exception as ex:                                  # noqa: BLE001
        log.exception("mjerenje markerima nije uspjelo")
        raise HTTPException(422, f"mjerenje nije uspjelo: {ex}")
    poly_plane = poly_px + origin
    if m.edge_drop_mm and cal:
        K = np.asarray(cal["K"], float)
        cw, ch = cal.get("image_size", [img.shape[1], img.shape[0]])
        if (cw, ch) != (img.shape[1], img.shape[0]):
            sc = img.shape[1] / cw
            K = K.copy(); K[0] *= sc; K[1] *= sc
        poly_plane = CB.correct_edge_drop(poly_plane, plane.H_img_to_mm, K, float(m.edge_drop_mm))
    # obris u mm s osi y prema GORE (kao papir/DXF); u slici je y prema dolje -> zrcali y
    p, corners = finish_polyline(poly_plane * np.array([1.0, -1.0]), sigma=4.0)
    p = np.round(p, 2)
    per = float(np.hypot(*np.diff(np.vstack([p, p[:1]]), axis=0).T).sum())
    cv2.imwrite(str(db.PHOTOS / f"{m.photo_id}_rect.jpg"), rect, [cv2.IMWRITE_JPEG_QUALITY, 75])
    q = plane.quality()
    q["seed_rect_px"] = [round(float(seed_rect[0]), 1), round(float(seed_rect[1]), 1)]
    q["calibrated"] = cal is not None
    q["device_key"] = key
    q["edge_drop_mm"] = float(m.edge_drop_mm) if cal else 0.0
    corners_out = [dict(s_start_mm=round(c["s_start"], 1), s_end_mm=round(c["s_end"], 1),
                        s_apex_mm=round(c["s_apex"], 1), turn_deg=round(c["turn_deg"], 1)) for c in corners]
    meas = Measurement(element_id=el.id, method="markers", photo_id=m.photo_id, params=m.model_dump(),
                       outline_mm=p.tolist(), corners=corners_out, quality=q, perimeter_mm=per, created_by=user)
    session.add(meas)
    session.commit()
    session.refresh(meas)
    markers_rect = [np.round(plane.img_to_mm(c) - origin, 1).tolist() for c in plane.corners_px]
    return dict(measurement_id=meas.id, method="markers", outline_mm=p.tolist(),
                outline_px=np.round(plane.mm_to_img(p * np.array([1.0, -1.0])), 1).tolist(), perimeter_mm=round(per, 1),
                bbox_mm=(p.min(0).tolist(), p.max(0).tolist()), corners=corners_out, quality=q,
                rect_url=f"/files/photos/{m.photo_id}_rect.jpg", rect_size=[rect.shape[1], rect.shape[0]],
                rect_to_mm=[[1, 0, float(origin[0])], [0, -1, -float(origin[1])]], markers_rect_px=markers_rect)


class AcceptIn(BaseModel):
    measurement_id: int
    outline_mm: Optional[list] = None      # obris koji je korisnik prstom popravio (mm)


@router.post("/elements/{el_id}/accept")
def accept_measurement(el_id: int, a: AcceptIn, session: Session = Depends(db.get_session)):
    el = session.get(Element, el_id)
    meas = session.get(Measurement, a.measurement_id)
    if not el or not meas or meas.element_id != el.id:
        raise HTTPException(404, "element ili mjerenje ne postoji")
    if a.outline_mm is not None:
        edited = _clean_outline(a.outline_mm)
        meas.params = dict(meas.params or {}, edited=True, outline_auto_mm=meas.outline_mm)
        meas.outline_mm = edited
        session.add(meas)
    el.outline_mm = _clean_outline(meas.outline_mm)
    el.measurement_id = meas.id
    el.method = meas.method
    el.status = "izmjeren"
    session.add(el)
    session.commit()
    session.refresh(el)
    out = el.model_dump()
    out["template_deviation"] = template_deviation(el.outline_mm, el.template_outline_mm)
    return out


# --------------------------------------------------------------------------- izvoz
@router.post("/jobs/{job_id}/export")
def export_job(job_id: int, page: str = "", discount: float = 0.0, session: Session = Depends(db.get_session)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "posao ne postoji")
    elems = [e for e in session.exec(select(Element).where(Element.job_id == job_id).order_by(Element.id)).all()
             if e.outline_mm]
    if not elems:
        raise HTTPException(422, "nijedan element nema izmjereni obris")
    out = db.JOBS / str(job_id)
    out.mkdir(parents=True, exist_ok=True)
    results, js = [], []
    for e in elems:
        p, corners = finish_polyline(np.asarray(e.outline_mm, float))
        per = float(np.hypot(*np.diff(np.vstack([p, p[:1]]), axis=0).T).sum())
        layer = (e.code or e.name or f"ELEMENT {e.id}").upper()
        results.append(dict(key=f"el{e.id}", layer=layer, file="", poly_mm=p, corners=corners, perimeter_mm=per,
                            bbox_mm=(p.min(0).tolist(), p.max(0).tolist()), features=e.features or []))
        js.append(dict(element_id=e.id, layer=layer, kind=e.kind, thickness_mm=e.thickness_mm, method=e.method,
                       perimeter_mm=round(per, 1), bbox_mm=results[-1]["bbox_mm"], poly_mm=np.round(p, 2).tolist(),
                       features=e.features or [], dodaci=FT.bom(p, e.features or [])))
    outputs.write_elements_1_1(results, str(out / "elementi_1_1"))
    outputs.write_strip_offset(results, str(out / "elementi_traka_offset"))
    (out / "konture_mm.json").write_text(json.dumps(js, ensure_ascii=False, indent=1), encoding="utf-8")
    rows = outputs.features_table(results)
    (out / "dodaci.csv").write_text("element;dodatak;kolicina;jedinica\n" + "".join(f"{a};{b};{c};{d}\n" for a, b, c, d in rows), encoding="utf-8")
    # ---- krojevi: lice, dno, traka, spužva sa šavom i zarezima po pravilima radionice
    rules = load_rules()
    page = page if page in PT.PAGES else rules.get("page", "A4")
    kroj_elems = []
    for e, r in zip(elems, results):
        k = PT.make_parts(r["poly_mm"], e.thickness_mm, e.features or [], rules, zone=e.zone, code=r["layer"])
        kroj_elems.append(dict(layer=r["layer"], kroj=k))
    kroj_out.write_dxf(kroj_elems, str(out / "kroj_1_1.dxf"))
    kroj_out.write_pdf(kroj_elems, str(out / f"kroj_1_1_{page}.pdf"), page=page)
    mat = [dict(element=k["layer"], **k["kroj"]["bom"]) for k in kroj_elems]
    # ---- nesting po materijalu: lice, dno, traka svakog elementa na rolu
    role, nest_names = [], []
    for material in sorted({k["kroj"]["material"] for k in kroj_elems}):
        items = []
        for k in kroj_elems:
            if k["kroj"]["material"] != material:
                continue
            free = material == "vinil"
            for part in k["kroj"]["parts"]:
                if part["name"] in ("LICE", "DNO", "TRAKA"):
                    items.append(dict(id=f"{k['layer']} {part['name']}", poly=part["poly"], rot_free=free, kind=part["name"]))
        width = float(rules["roll_width_mm"].get(material, 1370))
        try:
            placements, length = NEST.nest(items, width, float(rules.get("gap_mm", 15)))
        except ValueError as ex:
            role.append(dict(material=material, roll_width_mm=width, error=str(ex)))
            continue
        base = out / f"nesting_{material}"
        kroj_out.write_nesting(placements, material, width, length, str(base))
        nest_names += [f"nesting_{material}.pdf", f"nesting_{material}.dxf"]
        role.append(dict(material=material, roll_width_mm=width, length_m=round(length / 1000, 2),
                         utilization_pct=round(100 * NEST.utilization(placements, width, length), 1), n_parts=len(placements)))
    (out / "materijal.csv").write_text(
        "element;materijal;tkanina_m2;rola_mm;traka_visina_mm;traka_duljina_mm;spuzva_m2;spuzva_debljina_mm;zareza\n"
        + "".join(f"{m['element']};{m['material']};{m['fabric_m2']};{m['roll_width_mm']};{m['strip_height_mm']};{m['strip_length_mm']};{m['foam_m2']};{m['foam_thickness_mm']};{m['n_notches']}\n" for m in mat)
        + "\nrola;materijal;sirina_mm;duljina_m;iskoristivost_pct\n"
        + "".join(f"rola;{r['material']};{r['roll_width_mm']};{r.get('length_m', '')};{r.get('utilization_pct', '')}\n" for r in role),
        encoding="utf-8")
    # ---- ponuda
    boat = session.get(BoatModel, job.boat_model_id) if job.boat_model_id else None
    qin = [dict(layer=k["layer"], kind=e.kind, bom=k["kroj"]["bom"], dodaci=FT.bom(r["poly_mm"], e.features or []))
           for e, r, k in zip(elems, results, kroj_elems)]
    q = QT.quote(qin, [x for x in role if "length_m" in x], rules, discount_pct=discount)
    QT.write_quote_pdf(q, dict(id=job.id, customer=job.customer, boat_name=job.boat_name, marina=job.marina,
                               boat=f"{boat.builder} {boat.model}" if boat else None), rules, str(out / "ponuda.pdf"))
    names = [f"kroj_1_1_{page}.pdf", "kroj_1_1.dxf"] + nest_names + ["ponuda.pdf", "materijal.csv", "dodaci.csv", "elementi_1_1.dxf", "elementi_1_1.pdf",
             "elementi_traka_offset.dxf", "elementi_traka_offset.pdf", "konture_mm.json"]
    return dict(files=[dict(name=n, url=f"/files/jobs/{job_id}/{n}") for n in names], n_elements=len(elems), page=page, materijal=mat, role=role,
                ponuda=dict(ukupno_eur=q["ukupno_eur"], bez_pdv_eur=q["bez_pdv_eur"], materijal_eur=q["materijal_eur"], rad_eur=q["rad_eur"],
                            dodaci_eur=q["dodaci_eur"], marza_eur=q["marza_eur"], popust_eur=q["popust_eur"], pdv_eur=q["pdv_eur"], valuta=q["valuta"]))
