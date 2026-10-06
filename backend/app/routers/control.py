import logging
import os
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

from .. import exportar, insumos, planificador, procesos, repo
from ..config import settings
from ..periodo import ahora, periodo_actual, periodo_insumos
from ..security import get_current_user, require_csrf_header

logger = logging.getLogger(__name__)

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


MSG_CERRADA = "La asignación del periodo está completada; reábrela para hacer cambios"


def _motivos_completar(asignacion: dict | None, sin_asignar: int | None, en_curso: dict | None) -> list[str]:
    motivos = []
    if not asignacion or asignacion["Estado"] != "OK":
        motivos.append("La asignación no se ha generado en este periodo")
    elif sin_asignar is None:
        motivos.append("No se pudo revisar los equipos sin agencia")
    elif sin_asignar:
        motivos.append(f"Quedan {sin_asignar} equipo(s) sin agencia (paso 5)")
    if en_curso:
        motivos.append("Hay un proceso en curso")
    return motivos


# ---------- Estado del periodo ----------

def _estado() -> dict:
    periodo = periodo_actual()
    progs = {p["Tipo"]: p for p in repo.prog_listar()}
    en_curso = repo.proceso_en_curso()
    if en_curso:
        en_curso["DuracionPromedioMs"] = repo.duracion_promedio(en_curso["Tipo"])
        en_curso["DetalleSql"] = repo.sesion_detalle(en_curso["Spid"]) if en_curso["Spid"] else None

    lista_insumos = []
    validaciones = {}
    for ins in insumos.INSUMOS.values():
        validaciones[ins.clave] = repo.validacion_ultima(periodo, ins.clave)
        lista_insumos.append({
            "clave": ins.clave,
            "nombre": ins.nombre,
            "tipo_proceso": ins.tipo_proceso,
            "validacion": validaciones[ins.clave],
            "extraccion": repo.proceso_ultimo(periodo, ins.tipo_proceso),
            "programacion": progs.get(ins.tipo_proceso),
        })

    mora = repo.proceso_ultimo(periodo, "MORA")
    bloqueos = insumos.bloqueos_generar(validaciones, mora)
    if en_curso:
        bloqueos.append("Hay un proceso en curso")

    asignacion = repo.proceso_ultimo(periodo, "ASIGNACION")
    asignacion_ok = bool(asignacion and asignacion["Estado"] == "OK")
    sin_asignar = None
    if asignacion_ok:
        try:
            sin_asignar = repo.sin_asignar_contar()
        except Exception:
            logger.exception("No se pudo contar los equipos sin agencia")
    cierre = repo.cierre_get(periodo)
    bloqueos_completar = [] if cierre else _motivos_completar(asignacion, sin_asignar, en_curso)
    # Insumos listos y aún sin generar: la asignación espera que una persona la apruebe (Generar)
    pendiente_aprobacion = not bloqueos and not asignacion_ok and not cierre

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
            "proceso": asignacion,
            "duracion_promedio_ms": repo.duracion_promedio("ASIGNACION"),
        },
        "sin_asignar": sin_asignar,
        "cierre": cierre,
        "bloqueos_completar": bloqueos_completar,
        "puede_completar": not cierre and not bloqueos_completar,
        "bloqueos": bloqueos,
        "puede_generar": not bloqueos,
        "pendiente_aprobacion": pendiente_aprobacion,
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
    if repo.cierre_get(periodo):
        raise HTTPException(status.HTTP_409_CONFLICT, MSG_CERRADA)
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


# ---------- Equipos sin agencia ----------

LIMITE_SIN_ASIGNAR = 5000


def _sin_asignar() -> dict:
    columnas, filas = repo.sin_asignar_listar(LIMITE_SIN_ASIGNAR)
    for f in filas:
        f["_id"] = str(f["_id"]).strip()
    return {"columnas": columnas, "filas": filas, "total": repo.sin_asignar_contar()}


@router.get("/sin-asignar")
async def sin_asignar():
    return await run_in_threadpool(_sin_asignar)


def _asignados_manual() -> dict:
    columnas, filas = repo.asignados_manual_listar(periodo_actual(), LIMITE_SIN_ASIGNAR)
    for f in filas:
        f["_id"] = str(f["_id"]).strip()
        f["_agencia"] = None if f["_agencia"] is None else str(f["_agencia"]).strip()
    return {"columnas": columnas, "filas": filas, "total": len(filas)}


@router.get("/asignados-manual")
async def asignados_manual():
    return await run_in_threadpool(_asignados_manual)


@router.get("/agencias")
async def agencias():
    return await run_in_threadpool(repo.agencias_listar)


class AsignarAgenciaIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=LIMITE_SIN_ASIGNAR)
    agencia: str


def _asignar_agencia(data: AsignarAgenciaIn, usuario: str) -> dict:
    periodo = periodo_actual()
    if repo.cierre_get(periodo):
        raise HTTPException(status.HTTP_409_CONFLICT, MSG_CERRADA)
    if repo.proceso_en_curso():
        raise HTTPException(status.HTTP_409_CONFLICT, "Hay un proceso en curso; espera a que termine")
    agencia = next((a for a in repo.agencias_listar() if a["valor"] == data.agencia), None)
    if not agencia:
        raise HTTPException(422, "La agencia no existe en el catálogo")

    ids = list(dict.fromkeys(data.ids))
    actualizados = repo.asignar_agencia(ids, agencia["valor"], periodo, usuario)
    if actualizados:
        repo.bitacora_add(periodo, usuario, "ok",
                          f"Asignó la agencia {agencia['nombre']} a {actualizados} equipo(s)")
    if actualizados < len(ids):
        repo.bitacora_add(periodo, usuario, "warn",
                          f"{len(ids) - actualizados} equipo(s) no se actualizaron: la agencia la puso el SP, "
                          "ya tenían esa agencia o no existen")
    return {"actualizados": actualizados}


@router.post("/sin-asignar", dependencies=csrf)
async def asignar_agencia(data: AsignarAgenciaIn, usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_asignar_agencia, data, usuario)


# ---------- Completar (cierre del periodo) y exportar ----------

def _completar(usuario: str) -> dict:
    periodo = periodo_actual()
    if repo.cierre_get(periodo):
        raise HTTPException(status.HTTP_409_CONFLICT, "La asignación de este periodo ya está completada")
    # Revalidar en el servidor: no confiar en lo que muestra la pantalla
    motivos = _motivos_completar(repo.proceso_ultimo(periodo, "ASIGNACION"), repo.sin_asignar_contar(),
                                 repo.proceso_en_curso())
    if motivos:
        raise HTTPException(422, {"mensaje": "No se puede completar la asignación", "motivos": motivos})
    repo.cierre_crear(periodo, usuario)
    repo.bitacora_add(periodo, usuario, "ok", "Completó la asignación del periodo")
    return repo.cierre_get(periodo)


@router.post("/completar", dependencies=csrf)
async def completar(usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_completar, usuario)


def _reabrir(usuario: str) -> dict:
    periodo = periodo_actual()
    if not repo.cierre_get(periodo):
        raise HTTPException(status.HTTP_409_CONFLICT, "La asignación de este periodo no está completada")
    repo.cierre_eliminar(periodo)
    repo.bitacora_add(periodo, usuario, "warn", "Reabrió la asignación del periodo")
    return {"ok": True}


@router.post("/reabrir", dependencies=csrf)
async def reabrir(usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_reabrir, usuario)


def _exportar(usuario: str) -> FileResponse:
    periodo = periodo_actual()
    if not repo.cierre_get(periodo):
        raise HTTPException(status.HTTP_409_CONFLICT, "Completa la asignación antes de exportarla")
    ruta, filas = exportar.asignacion_xlsx()
    repo.bitacora_add(periodo, usuario, "info", f"Exportó la asignación a Excel ({filas} filas)")
    return FileResponse(
        ruta,
        filename=f"Asignacion_{periodo}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(os.remove, ruta),
    )


@router.get("/exportar")
async def exportar_excel(usuario: str = Depends(get_current_user)):
    return await run_in_threadpool(_exportar, usuario)


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
