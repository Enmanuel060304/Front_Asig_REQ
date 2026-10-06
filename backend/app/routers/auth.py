from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .. import repo
from ..config import settings
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


@router.post("/login", dependencies=[Depends(require_csrf_header)])
async def login(data: LoginIn, response: Response):
    hashed = await run_in_threadpool(repo.usuario_hash, data.username)
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


@router.get("/config")
def config():
    """Pública: el front la lee antes del login para avisar que es el modo demo."""
    return {"demo": settings.DEMO_MODE}
