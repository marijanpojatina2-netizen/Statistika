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
from . import db
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
def create_job(j: JobIn, session: Session = Depends(db.get_session)):
    job = Job(**{k: v for k, v in j.model_dump().items() if v is not None})
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
    status: Optional[str] = None
    method: Optional[str] = None


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
    return dict(element=el, measurement=m, job=job, boat=boat)


@router.patch("/elements/{el_id}")
def update_element(el_id: int, e: ElementIn, session: Session = Depends(db.get_session)):
    el = session.get(Element, el_id)
    if not el:
        raise HTTPException(404, "element ne postoji")
    data = e.model_dump(exclude_unset=True)
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


def _clean_outline(pts) -> list:
    p = np.asarray(pts, float).reshape(-1, 2)
    if len(p) < 3:
        raise HTTPException(422, "obris treba bar 3 točke")
    x, y = p[:, 0], p[:, 1]
    if 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y) < 0:
        p = p[::-1]
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
    return dict(photo_id=pid, width=w, height=h, preview_url=f"/files/photos/{pid}_p.jpg",
                preview_width=prev.shape[1], preview_height=prev.shape[0])


# --------------------------------------------------------------------------- mjerenje (metoda A)
class MeasureIn(BaseModel):
    photo_id: str
    origin_px: tuple[float, float]
    x_axis_px: tuple[float, float]
    seed_px: tuple[float, float]
    square_corner_cm: Optional[tuple[float, float]] = None
    px_per_cm: Optional[float] = None


@router.post("/elements/{el_id}/measure")
def measure_element(el_id: int, m: MeasureIn, session: Session = Depends(db.get_session)):
    el = session.get(Element, el_id)
    if not el:
        raise HTTPException(404, "element ne postoji")
    path = db.PHOTOS / f"{m.photo_id}.jpg"
    if not path.exists():
        raise HTTPException(404, "fotografija ne postoji")
    img = cv2.imread(str(path))
    try:
        res = measure_grid(img, m.origin_px, x_axis_px=m.x_axis_px, seed_px=m.seed_px,
                           square_corner_cm=m.square_corner_cm, px_per_cm=m.px_per_cm)
    except Exception as ex:                                  # noqa: BLE001
        log.exception("mjerenje nije uspjelo")
        raise HTTPException(422, f"mjerenje nije uspjelo: {ex}")
    ctl = res.control_images(img)
    cv2.imwrite(str(db.PHOTOS / f"{m.photo_id}_ctl.jpg"), ctl["rectified"], [cv2.IMWRITE_JPEG_QUALITY, 80])
    outline_px = res.grid.cm_to_px(res.poly_mm / 10.0)
    d = res.to_dict()
    meas = Measurement(element_id=el.id, method="grid", photo_id=m.photo_id, params=m.model_dump(),
                       outline_mm=d["poly_mm"], corners=d["corners"], quality=d["quality"], perimeter_mm=res.perimeter_mm)
    session.add(meas)
    session.commit()
    session.refresh(meas)
    return dict(measurement_id=meas.id, outline_mm=d["poly_mm"], outline_px=np.round(outline_px, 1).tolist(),
                perimeter_mm=d["perimeter_mm"], bbox_mm=d["bbox_mm"], corners=d["corners"], quality=d["quality"],
                control_url=f"/files/photos/{m.photo_id}_ctl.jpg")


class AcceptIn(BaseModel):
    measurement_id: int


@router.post("/elements/{el_id}/accept")
def accept_measurement(el_id: int, a: AcceptIn, session: Session = Depends(db.get_session)):
    el = session.get(Element, el_id)
    meas = session.get(Measurement, a.measurement_id)
    if not el or not meas or meas.element_id != el.id:
        raise HTTPException(404, "element ili mjerenje ne postoji")
    el.outline_mm = meas.outline_mm
    el.measurement_id = meas.id
    el.method = meas.method
    el.status = "izmjeren"
    session.add(el)
    session.commit()
    session.refresh(el)
    return el


# --------------------------------------------------------------------------- izvoz
@router.post("/jobs/{job_id}/export")
def export_job(job_id: int, session: Session = Depends(db.get_session)):
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
    from jastuk_cv.measure import finish_polyline
    for e in elems:
        p, corners = finish_polyline(np.asarray(e.outline_mm, float))
        per = float(np.hypot(*np.diff(np.vstack([p, p[:1]]), axis=0).T).sum())
        layer = (e.code or e.name or f"ELEMENT {e.id}").upper()
        results.append(dict(key=f"el{e.id}", layer=layer, file="", poly_mm=p, corners=corners, perimeter_mm=per,
                            bbox_mm=(p.min(0).tolist(), p.max(0).tolist())))
        js.append(dict(element_id=e.id, layer=layer, kind=e.kind, thickness_mm=e.thickness_mm, method=e.method,
                       perimeter_mm=round(per, 1), bbox_mm=results[-1]["bbox_mm"], poly_mm=np.round(p, 2).tolist()))
    outputs.write_elements_1_1(results, str(out / "elementi_1_1"))
    outputs.write_strip_offset(results, str(out / "elementi_traka_offset"))
    (out / "konture_mm.json").write_text(json.dumps(js, ensure_ascii=False, indent=1), encoding="utf-8")
    names = ["elementi_1_1.dxf", "elementi_1_1.pdf", "elementi_traka_offset.dxf", "elementi_traka_offset.pdf", "konture_mm.json"]
    return dict(files=[dict(name=n, url=f"/files/jobs/{job_id}/{n}") for n in names], n_elements=len(elems))
