"""Acciones exclusivas del modo demo. `main.py` solo incluye este router con DEMO_MODE=true."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from .. import periodo, procesos, repo
from ..security import get_current_user, require_csrf_header

router = APIRouter(prefix="/api/demo", tags=["demo"], dependencies=[Depends(get_current_user)])


def _siguiente_periodo(usuario: str) -> dict:
    if procesos.ocupado():
        raise HTTPException(status.HTTP_409_CONFLICT, "Hay un proceso en curso; espera a que termine")
    anterior = periodo.periodo_actual()
    nuevo = periodo.avanzar_periodo()
    repo.bitacora_add(nuevo, usuario, "info", f"Demo: se pasó del periodo {anterior} al {nuevo}")
    return {"periodo": nuevo}


@router.post("/siguiente-periodo", dependencies=[Depends(require_csrf_header)])
async def siguiente_periodo(usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_siguiente_periodo, usuario)
