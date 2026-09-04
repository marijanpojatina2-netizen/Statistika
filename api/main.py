"""Jastuk API + statička web aplikacija.

    uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import db
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    yield


app = FastAPI(title="Jastuk API", version="0.1.0", lifespan=lifespan)
app.include_router(router, prefix="/api")
app.mount("/files", StaticFiles(directory=str(db.VAR), check_dir=False), name="files")
app.mount("/", StaticFiles(directory=str(Path(__file__).resolve().parent.parent / "app"), html=True), name="app")
