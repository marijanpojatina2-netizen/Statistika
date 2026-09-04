"""Jastuk API + statička web aplikacija.

    uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth, db
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    auth.ensure_default_user()
    yield


app = FastAPI(title="Jastuk API", version="0.1.0", lifespan=lifespan)


class LoginIn(BaseModel):
    username: str
    password: str


@app.post("/api/login")
def api_login(body: LoginIn):
    return dict(token=auth.login(body.username.strip(), body.password), username=body.username.strip())


@app.post("/api/logout")
def api_logout(request: Request, user: str = auth.UserDep):
    a = request.headers.get("authorization", "")
    auth.logout(a[7:] if a.lower().startswith("bearer ") else "")
    return {"ok": True}


@app.get("/api/me")
def api_me(user: str = auth.UserDep):
    return {"username": user}


app.include_router(router, prefix="/api", dependencies=[Depends(auth.current_user)])


class AuthedFiles(StaticFiles):
    """Fotografije i izvozi samo s prijavom (token u zaglavlju ili ?token= za linkove iz preglednika)."""
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            req = Request(scope, receive)
            try:
                auth.current_user(req)
            except Exception as ex:                                   # noqa: BLE001
                resp = JSONResponse({"detail": getattr(ex, "detail", "prijava je potrebna")}, status_code=401)
                await resp(scope, receive, send)
                return
        await super().__call__(scope, receive, send)


app.mount("/files", AuthedFiles(directory=str(db.VAR), check_dir=False), name="files")
app.mount("/", StaticFiles(directory=str(Path(__file__).resolve().parent.parent / "app"), html=True), name="app")
