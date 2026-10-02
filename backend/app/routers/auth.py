from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ..db import get_connection
from ..security import (
    clear_auth_cookie,
    create_token,
    get_current_user,
    require_csrf_header,
    set_auth_cookie,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


def _buscar_hash(username: str) -> str | None:
    with get_connection() as conn:
        row = conn.cursor().execute(
            "SELECT PasswordHash FROM dbo.AppUsuarios WHERE Username = ? AND Activo = 1", username
        ).fetchone()
    return row[0] if row else None


@router.post("/login", dependencies=[Depends(require_csrf_header)])
async def login(data: LoginIn, response: Response):
    hashed = await run_in_threadpool(_buscar_hash, data.username)
    if not hashed or not verify_password(data.password, hashed):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")
    set_auth_cookie(response, create_token(data.username))
    return {"username": data.username}


@router.post("/logout", dependencies=[Depends(require_csrf_header)])
def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(username: str = Depends(get_current_user)):
    return {"username": username}
