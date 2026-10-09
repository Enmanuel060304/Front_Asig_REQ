"""Mantenimiento del catálogo de agencias: a qué agencia pertenece cada distrito y municipio."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, field_validator

from .. import procesos, repo
from ..catalogo import CatalogoError, ClaveDuplicada, NoEncontrado
from ..periodo import periodo_actual
from ..security import get_current_user, require_csrf_header

router = APIRouter(prefix="/api/catalogo", tags=["catalogo"], dependencies=[Depends(get_current_user)])
csrf = [Depends(require_csrf_header)]

Texto = Field(min_length=1, max_length=100)


class _Texto(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def _recortar(cls, v):
        return v.strip() if isinstance(v, str) else v


class DistritoIn(_Texto):
    distrito: str = Texto
    agencia: str = Texto


class MunicipioIn(_Texto):
    municipio: str = Texto
    agencia: str = Texto


class AgenciaIn(_Texto):
    agencia: str = Texto


def _escribir(accion, texto_bitacora, *args):
    """Ejecuta una escritura del catálogo. Las tablas las lee el SP de asignación: no se tocan mientras corre."""
    if procesos.ocupado():
        raise HTTPException(status.HTTP_409_CONFLICT, "Hay un proceso en curso; el catálogo se puede editar al terminar")
    usuario = args[-1]
    try:
        resultado = accion(*args)
    except ClaveDuplicada as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    except NoEncontrado as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    except CatalogoError as e:  # pragma: no cover
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    repo.bitacora_add(periodo_actual(), usuario, "info", f"Catálogo: {texto_bitacora(resultado)}")
    return resultado


# ---------- Agencias ----------

@router.get("/agencias")
async def agencias():
    return await run_in_threadpool(repo.catalogo_agencias)


@router.put("/agencias/{nombre:path}", dependencies=csrf)
async def renombrar_agencia(nombre: str, data: AgenciaIn, usuario: str = Depends(get_current_user)):
    def txt(r):
        return f"renombró la agencia «{nombre}» a «{data.agencia}» ({r[0]} distrito(s), {r[1]} municipio(s))"
    d, m = await run_in_threadpool(_escribir, repo.catalogo_agencia_renombrar, txt, nombre, data.agencia, usuario)
    return {"distritos": d, "municipios": m}


@router.delete("/agencias/{nombre:path}", dependencies=csrf)
async def eliminar_agencia(nombre: str, usuario: str = Depends(get_current_user)):
    def txt(r):
        return f"eliminó la agencia «{nombre}» con sus {r[0]} distrito(s) y {r[1]} municipio(s)"
    d, m = await run_in_threadpool(_escribir, repo.catalogo_agencia_eliminar, txt, nombre, usuario)
    return {"distritos": d, "municipios": m}


# ---------- Distritos ----------

@router.get("/distritos")
async def distritos():
    return await run_in_threadpool(repo.catalogo_distritos)


@router.post("/distritos", status_code=201, dependencies=csrf)
async def crear_distrito(data: DistritoIn, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(
        _escribir, repo.catalogo_distrito_crear,
        lambda r: f"agregó el distrito «{r['distrito']}» → {r['agencia']}", data.distrito, data.agencia, usuario)


@router.put("/distritos/{distrito:path}", dependencies=csrf)
async def actualizar_distrito(distrito: str, data: DistritoIn, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(
        _escribir, repo.catalogo_distrito_actualizar,
        lambda r: f"modificó el distrito «{distrito}» → «{r['distrito']}» / {r['agencia']}",
        distrito, data.distrito, data.agencia, usuario)


@router.delete("/distritos/{distrito:path}", dependencies=csrf)
async def eliminar_distrito(distrito: str, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(
        _escribir, repo.catalogo_distrito_eliminar,
        lambda r: f"eliminó el distrito «{r['distrito']}» (agencia {r['agencia']})", distrito, usuario)


# ---------- Municipios ----------

@router.get("/municipios")
async def municipios():
    return await run_in_threadpool(repo.catalogo_municipios)


@router.post("/municipios", status_code=201, dependencies=csrf)
async def crear_municipio(data: MunicipioIn, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(
        _escribir, repo.catalogo_municipio_crear,
        lambda r: f"agregó el municipio «{r['municipio']}» → {r['agencia']}", data.municipio, data.agencia, usuario)


@router.put("/municipios/{id_}", dependencies=csrf)
async def actualizar_municipio(id_: int, data: MunicipioIn, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(
        _escribir, repo.catalogo_municipio_actualizar,
        lambda r: f"modificó el municipio {id_} → «{r['municipio']}» / {r['agencia']}",
        id_, data.municipio, data.agencia, usuario)


@router.delete("/municipios/{id_}", dependencies=csrf)
async def eliminar_municipio(id_: int, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(
        _escribir, repo.catalogo_municipio_eliminar,
        lambda r: f"eliminó el municipio «{r['municipio']}» (agencia {r['agencia']})", id_, usuario)
