"""Prijava: korisnici u var/users.json (lozinke PBKDF2), tokeni u var/tokens.json.
Dva korisnika s punim pravima; svaka promjena pamti tko ju je napravio (created_by).

    python3 tools/users.py add marijan    # dodaj/promijeni lozinku (pita lozinku)
    python3 tools/users.py list
Ako nema nijednog korisnika, poslužitelj pri pokretanju stvori 'radionica' / 'jastuk' i upozori u logu.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from typing import Optional

from fastapi import Depends, HTTPException, Request

from . import db

log = logging.getLogger("jastuk_api")
TOKEN_DAYS = 180


def _users_path():
    return db.VAR / "users.json"


def _tokens_path():
    return db.VAR / "tokens.json"


def _load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def _save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def hash_password(pw: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt), 200_000).hex()
    return f"{salt}${h}"


def verify_password(pw: str, stored: str) -> bool:
    salt, h = stored.split("$", 1)
    return hmac.compare_digest(hash_password(pw, salt), stored)


def set_user(username: str, password: str):
    users = _load(_users_path(), {})
    users[username] = dict(password=hash_password(password), created_at=time.time())
    _save(_users_path(), users)


def list_users() -> list:
    return sorted(_load(_users_path(), {}).keys())


def ensure_default_user():
    if not _load(_users_path(), {}):
        set_user("radionica", "jastuk")
        log.warning("nema korisnika: stvoren 'radionica' s lozinkom 'jastuk'. Promijeni je: python3 tools/users.py add radionica")


def login(username: str, password: str) -> str:
    users = _load(_users_path(), {})
    u = users.get(username)
    if not u or not verify_password(password, u["password"]):
        raise HTTPException(401, "krivo korisničko ime ili lozinka")
    tokens = _load(_tokens_path(), {})
    now = time.time()
    tokens = {t: v for t, v in tokens.items() if v["exp"] > now}          # očisti istekle
    tok = secrets.token_urlsafe(32)
    tokens[tok] = dict(user=username, exp=now + TOKEN_DAYS * 86400)
    _save(_tokens_path(), tokens)
    return tok


def logout(token: str):
    tokens = _load(_tokens_path(), {})
    tokens.pop(token, None)
    _save(_tokens_path(), tokens)


def current_user(request: Request) -> str:
    """Ovisnost: korisnik iz 'Authorization: Bearer <token>'. JASTUK_NO_AUTH=1 isključuje prijavu (razvoj)."""
    if os.environ.get("JASTUK_NO_AUTH") == "1":
        return "dev"
    auth = request.headers.get("authorization", "")
    tok = auth[7:] if auth.lower().startswith("bearer ") else request.query_params.get("token", "")
    if not tok:
        raise HTTPException(401, "prijava je potrebna")
    v = _load(_tokens_path(), {}).get(tok)
    if not v or v["exp"] < time.time():
        raise HTTPException(401, "prijava je istekla")
    return v["user"]


UserDep = Depends(current_user)
