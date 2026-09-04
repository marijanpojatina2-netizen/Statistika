"""Model podataka (faza 1): brodovi, poslovi, elementi, mjerenja. SQLite sada, PostgreSQL kasnije
(SQLModel/SQLAlchemy, pa je zamjena baze promjena jednog URL-a)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class BoatModel(SQLModel, table=True):
    __tablename__ = "boat_models"
    id: Optional[int] = Field(default=None, primary_key=True)
    builder: str = Field(index=True)
    model: str = Field(index=True)
    type: str                       # jedrilica | katamaran | motorni
    loa_m: float
    beam_m: float
    year_from: int
    year_to: Optional[int] = None
    cabins: str = ""                # "3/4"
    priority: Optional[int] = None
    notes: str = ""


class Job(SQLModel, table=True):
    __tablename__ = "jobs"
    id: Optional[int] = Field(default=None, primary_key=True)
    boat_model_id: Optional[int] = Field(default=None, foreign_key="boat_models.id")
    boat_name: str = ""
    customer: str = ""
    marina: str = ""
    notes: str = ""
    status: str = "aktivan"         # aktivan | isporučen | arhiva
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Element(SQLModel, table=True):
    """Jedan jastuk (ili dio) na jednom poslu. sketch = poligon nacrtan prstom u normaliziranim
    koordinatama sheme broda (0..1); outline_mm = izmjereni/potvrđeni obris u mm."""
    __tablename__ = "elements"
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="jobs.id", index=True)
    code: str = ""                  # npr. "1A PROVA LIJEVA"
    name: str = ""
    zone: str = "kokpit"            # kokpit | salon | prova | krma | paluba
    kind: str = "sjedalo"           # sjedalo | naslon | madrac | lezaj | ostalo
    thickness_mm: int = 50
    notes: str = ""
    sketch: Optional[list] = Field(default=None, sa_column=Column(JSON))
    outline_mm: Optional[list] = Field(default=None, sa_column=Column(JSON))
    method: str = ""                # grid | markers | manual
    status: str = "nacrtan"         # nacrtan | izmjeren | potvrđen
    measurement_id: Optional[int] = None


class Measurement(SQLModel, table=True):
    __tablename__ = "measurements"
    id: Optional[int] = Field(default=None, primary_key=True)
    element_id: int = Field(foreign_key="elements.id", index=True)
    method: str = "grid"
    photo_id: str = ""
    params: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    outline_mm: Optional[list] = Field(default=None, sa_column=Column(JSON))
    corners: Optional[list] = Field(default=None, sa_column=Column(JSON))
    quality: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    perimeter_mm: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
