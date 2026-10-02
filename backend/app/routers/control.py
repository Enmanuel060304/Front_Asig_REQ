from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .. import insumos, planificador, procesos, repo
from ..config import settings
from ..periodo import ahora, periodo_actual, periodo_insumos
from ..security import get_current_user, require_csrf_header

router = APIRouter(prefix="/api/control", tags=["control"], dependencies=[Depends(get_current_user)])
csrf = [Depends(require_csrf_header)]

InsumoClave = Literal["BAJAS", "CAMBIO_TEC"]
TipoProgramable = Literal["MORA", "EXTRAER_BAJAS", "EXTRAER_CAMBIO_TEC"]


def _iniciar(tipo: str, usuario: str) -> dict:
    try:
        id_ = procesos.iniciar(tipo, usuario)
    except procesos.ProcesoEnCurso:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay un proceso en curso; espera a que termine")
    return {"id": id_}


# ---------- Estado del periodo ----------

def _estado() -> dict:
    periodo = periodo_actual()
    progs = {p["Tipo"]: p for p in repo.prog_listar()}
    en_curso = repo.proceso_en_curso()
    if en_curso:
        en_curso["DuracionPromedioMs"] = repo.duracion_promedio(en_curso["Tipo"])
        en_curso["DetalleSql"] = repo.sesion_detalle(en_curso["Spid"]) if en_curso["Spid"] else None

    lista_insumos = []
    bloqueos = []
    for ins in insumos.INSUMOS.values():
        validacion = repo.validacion_ultima(periodo, ins.clave)
        lista_insumos.append({
            "clave": ins.clave,
            "nombre": ins.nombre,
            "tipo_proceso": ins.tipo_proceso,
            "validacion": validacion,
            "extraccion": repo.proceso_ultimo(periodo, ins.tipo_proceso),
            "programacion": progs.get(ins.tipo_proceso),
        })
        if not validacion:
            bloqueos.append(f"{ins.nombre}: sin validar")
        elif not insumos.es_valida(validacion):
            bloqueos.append(f"{ins.nombre}: {validacion['Detalle']}")

    mora = repo.proceso_ultimo(periodo, "MORA")
    if not mora or mora["Estado"] != "OK":
        bloqueos.append("Mora: no se ha generado en este periodo")
    elif not mora["Filas"]:
        bloqueos.append("Mora: la tabla quedó vacía")
    if en_curso:
        bloqueos.append("Hay un proceso en curso")

    return {
        "periodo": periodo,
        "periodo_insumos": periodo_insumos(periodo),
        "ahora": ahora(),
        "en_curso": en_curso,
        "insumos": lista_insumos,
        "mora": {
            "proceso": mora,
            "duracion_promedio_ms": repo.duracion_promedio("MORA"),
            "programacion": progs.get("MORA"),
        },
        "asignacion": {
            "proceso": repo.proceso_ultimo(periodo, "ASIGNACION"),
            "duracion_promedio_ms": repo.duracion_promedio("ASIGNACION"),
        },
        "bloqueos": bloqueos,
        "puede_generar": not bloqueos,
        "bitacora": repo.bitacora_listar(periodo),
    }


@router.get("")
async def estado():
    return await run_in_threadpool(_estado)


# ---------- Acciones ----------

@router.post("/validar/{insumo}", dependencies=csrf)
async def validar(insumo: InsumoClave, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(insumos.validar, insumo, usuario)


@router.post("/extraer/{insumo}", status_code=202, dependencies=csrf)
async def extraer(insumo: InsumoClave, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_iniciar, insumos.INSUMOS[insumo].tipo_proceso, usuario)


@router.post("/mora", status_code=202, dependencies=csrf)
async def mora(usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_iniciar, "MORA", usuario)


def _iniciar_asignacion(usuario: str, regenerar: bool) -> dict:
    if repo.proceso_en_curso():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay un proceso en curso; espera a que termine")

    periodo = periodo_actual()
    motivos = []
    # Revalidar en el momento: no confiar en lo que muestra la pantalla
    for ins in insumos.INSUMOS.values():
        v = insumos.validar(ins.clave, usuario)
        if not insumos.es_valida(v):
            motivos.append(f"{ins.nombre}: {v['Detalle']}")
    mora = repo.proceso_ultimo(periodo, "MORA")
    if not mora or mora["Estado"] != "OK":
        motivos.append("Mora: no se ha generado en este periodo")
    elif repo.contar_filas(settings.MORA_TABLA) == 0:
        motivos.append("Mora: la tabla está vacía")
    if motivos:
        raise HTTPException(422, {"mensaje": "Faltan insumos", "motivos": motivos})

    previa = repo.proceso_ultimo(periodo, "ASIGNACION")
    if previa and previa["Estado"] == "OK" and not regenerar:
        raise HTTPException(status.HTTP_409_CONFLICT, "La asignación de este periodo ya fue generada")

    return _iniciar("ASIGNACION", usuario)


@router.post("/asignacion", status_code=202, dependencies=csrf)
async def asignacion(regenerar: bool = False, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_iniciar_asignacion, usuario, regenerar)


# ---------- Consultas ----------

@router.get("/procesos/{id_}")
async def proceso(id_: int):
    p = await run_in_threadpool(repo.proceso_get, id_)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proceso no encontrado")
    return p


@router.get("/procesos")
async def procesos_listar(tipo: str | None = None, limite: int = 500):
    return await run_in_threadpool(repo.procesos_listar, tipo, min(max(limite, 1), 5000))


def _resumen() -> dict:
    periodo = periodo_actual()
    return {
        "periodo": periodo,
        "asignacion": repo.proceso_ultimo(periodo, "ASIGNACION"),
        "mora": repo.proceso_ultimo(periodo, "MORA"),
        "mora_duracion_promedio_ms": repo.duracion_promedio("MORA"),
        "por_dia": [{"fecha": r["Dia"].isoformat(), "ok": r["Ok"], "error": r["Error"]} for r in repo.procesos_por_dia(90)],
    }


@router.get("/resumen")
async def resumen():
    return await run_in_threadpool(_resumen)


# ---------- Programaciones ----------

class ProgramacionIn(BaseModel):
    modo: Literal["UNICA", "MENSUAL"]
    fecha_hora: datetime | None = None
    dia_mes: int | None = Field(None, ge=1, le=31)
    hora: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


def _guardar_programacion(tipo: str, data: ProgramacionIn, usuario: str) -> dict:
    if data.modo == "UNICA" and not data.fecha_hora:
        raise HTTPException(422, "Indica la fecha y hora")
    if data.modo == "MENSUAL" and (data.dia_mes is None or not data.hora):
        raise HTTPException(422, "Indica el día del mes y la hora")
    fecha_hora = data.fecha_hora.replace(tzinfo=None, second=0, microsecond=0) if data.fecha_hora else None
    proxima = planificador.calcular_proxima(data.modo, fecha_hora, data.dia_mes, data.hora, ahora())
    if proxima is None:
        raise HTTPException(422, "La fecha y hora deben ser futuras")

    repo.prog_guardar(tipo, data.modo, fecha_hora, data.dia_mes if data.modo == "MENSUAL" else None,
                      data.hora if data.modo == "MENSUAL" else None, proxima, usuario)
    nombre = procesos.TIPOS[tipo].nombre
    cuando = f"el día {data.dia_mes} de cada mes a las {data.hora}" if data.modo == "MENSUAL" else f"{proxima:%d/%m/%Y %H:%M}"
    repo.bitacora_add(periodo_actual(), usuario, "info", f"Programó {nombre}: {cuando}")
    return repo.prog_get(tipo)


@router.put("/programaciones/{tipo}", dependencies=csrf)
async def guardar_programacion(tipo: TipoProgramable, data: ProgramacionIn, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_guardar_programacion, tipo, data, usuario)


class ActivaIn(BaseModel):
    activa: bool


def _cambiar_activa(tipo: str, activa: bool, usuario: str) -> dict:
    prog = repo.prog_get(tipo)
    if not prog:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay programación")
    proxima = None
    if activa:
        proxima = planificador.calcular_proxima(prog["Modo"], prog["FechaHora"], prog["DiaMes"], prog["Hora"], ahora())
        if proxima is None:
            raise HTTPException(422, "La fecha programada ya pasó; edita la programación")
    repo.prog_actualizar(tipo, Activa=activa, ProximaEjecucion=proxima, VencimientoOriginal=proxima)
    accion = "Reanudó" if activa else "Pausó"
    repo.bitacora_add(periodo_actual(), usuario, "info", f"{accion} la programación de {procesos.TIPOS[tipo].nombre}")
    return repo.prog_get(tipo)


@router.patch("/programaciones/{tipo}", dependencies=csrf)
async def cambiar_activa(tipo: TipoProgramable, data: ActivaIn, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_cambiar_activa, tipo, data.activa, usuario)


def _eliminar_programacion(tipo: str, usuario: str) -> dict:
    repo.prog_eliminar(tipo)
    repo.bitacora_add(periodo_actual(), usuario, "info", f"Eliminó la programación de {procesos.TIPOS[tipo].nombre}")
    return {"ok": True}


@router.delete("/programaciones/{tipo}", dependencies=csrf)
async def eliminar_programacion(tipo: TipoProgramable, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_eliminar_programacion, tipo, usuario)
