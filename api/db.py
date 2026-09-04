"""Veza na bazu i početno punjenje popisa brodova iz data/brodovi.csv."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, select

from .models import BoatModel

ROOT = Path(__file__).resolve().parent.parent
VAR = Path(os.environ.get("JASTUK_VAR", ROOT / "var")).resolve()
PHOTOS = VAR / "photos"
JOBS = VAR / "jobs"

engine = create_engine(f"sqlite:///{VAR / 'jastuk.db'}", connect_args={"check_same_thread": False})


def get_session():
    with Session(engine) as s:
        yield s


def seed_boats(session: Session) -> int:
    if session.exec(select(BoatModel).limit(1)).first():
        return 0
    sys.path.insert(0, str(ROOT / "data"))
    from seed_boats import load  # noqa: E402
    rows = load()
    for r in rows:
        session.add(BoatModel(builder=r["proizvodjac"], model=r["model"], type=r["tip"], loa_m=r["loa_m"],
                              beam_m=r["sirina_m"], year_from=r["godina_od"], year_to=r["godina_do"],
                              cabins="/".join(str(k) for k in r["kabine"]), priority=r["prioritet"],
                              notes=r.get("napomena", "")))
    session.commit()
    return len(rows)


def init():
    for d in (VAR, PHOTOS, JOBS):
        d.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    migrate()
    with Session(engine) as s:
        seed_boats(s)


# stupci dodani nakon prve verzije: (tablica, stupac, SQL tip)
MIGRATIONS = [("elements", "features", "JSON"), ("jobs", "created_by", "VARCHAR DEFAULT ''"), ("measurements", "created_by", "VARCHAR DEFAULT ''")]


def migrate():
    """create_all ne dodaje stupce u postojeće tablice; ovo ih doda ako nedostaju (SQLite)."""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, col, typ in MIGRATIONS:
            if table in insp.get_table_names() and col not in [c["name"] for c in insp.get_columns(table)]:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {typ}"))
