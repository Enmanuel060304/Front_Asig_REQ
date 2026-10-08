"""Planificador interno: dispara a su hora los procesos programados desde la web.

Corre como hilo dentro del backend, por lo que el backend debe estar activo (servicio) y con un solo worker.
"""
import logging
import threading
from datetime import datetime, time, timedelta

from . import insumos, procesos, repo
from .config import settings
from .periodo import ahora, periodo_actual, proxima_mensual

log = logging.getLogger(__name__)

TIPOS_PROGRAMABLES = ("INSUMOS", "MORA", "EXTRAER_BAJAS", "EXTRAER_CAMBIO_TEC")  # INSUMOS = flujo completo (extraer + generar)
INTERVALO_SEG = 30
REINTENTO = timedelta(minutes=5)

_stop = threading.Event()


def calcular_proxima(modo: str, fecha_hora: datetime | None, dia_mes: int | None, hora: str | None,
                     desde: datetime) -> datetime | None:
    if modo == "UNICA":
        return fecha_hora if fecha_hora and fecha_hora > desde else None
    hh, mm = (int(x) for x in hora.split(":"))
    return proxima_mensual(dia_mes, time(hh, mm), desde)


def _avanzar(prog: dict, momento: datetime, **extra) -> None:
    """Pasa a la siguiente ocurrencia (mensual) o desactiva (única)."""
    sig = calcular_proxima(prog["Modo"], None, prog["DiaMes"], prog["Hora"], momento) if prog["Modo"] == "MENSUAL" else None
    repo.prog_actualizar(prog["Tipo"], Activa=sig is not None, ProximaEjecucion=sig, VencimientoOriginal=sig, **extra)


def _procesar(prog: dict, momento: datetime) -> None:
    tipo = prog["Tipo"]
    nombre = procesos.nombre(tipo)
    usuario = f"programador ({prog['CreadoPor']})"
    periodo = periodo_actual()
    vencimiento = prog["VencimientoOriginal"] or prog["ProximaEjecucion"]
    retraso = momento - vencimiento

    if retraso > timedelta(minutes=settings.PROGRAMACION_TOLERANCIA_MIN):
        resultado = (f"No se ejecutó la de {vencimiento:%d/%m/%Y %H:%M}: "
                     f"superó la tolerancia de {settings.PROGRAMACION_TOLERANCIA_MIN} min")
        repo.bitacora_add(periodo, usuario, "warn", f"{nombre} programada: {resultado}")
        _avanzar(prog, momento, UltimoResultado=resultado, UltimoNivel="warn")
        return

    clave = None if tipo == "INSUMOS" else next(k for k, t in insumos.TIPO_PROCESO.items() if t == tipo)
    # Extracción suelta: si el insumo ya es válido no se recarga (si hay otro proceso, se evalúa en el reintento)
    if clave and clave != "MORA" and not procesos.ocupado():
        validacion = insumos.validar(clave, usuario)
        if insumos.es_valida(validacion):
            resultado = (f"Omitida el {momento:%d/%m/%Y %H:%M}: el insumo ya tenía el periodo "
                         f"{validacion['PeriodoEncontrado'] or validacion['Detalle']}, no hizo falta extraer")
            repo.bitacora_add(periodo, usuario, "info", f"{nombre} programada: {resultado}")
            _avanzar(prog, momento, UltimaEjecucion=momento, UltimoResultado=resultado, UltimoNivel="info")
            return

    try:
        if clave:
            id_ = procesos.iniciar(tipo, usuario, "PROGRAMADO")
        else:  # el flujo completo: extrae en paralelo y genera la asignación si los insumos quedan válidos
            procesos.iniciar_secuencia(usuario, "PROGRAMADO")
            id_ = None
    except procesos.NadaPorHacer:
        resultado = (f"Omitida el {momento:%d/%m/%Y %H:%M}: los insumos ya estaban listos "
                     "y la asignación ya estaba generada")
        repo.bitacora_add(periodo, usuario, "info", f"{nombre} programada: {resultado}")
        _avanzar(prog, momento, UltimaEjecucion=momento, UltimoResultado=resultado, UltimoNivel="info")
        return
    except procesos.PeriodoCerrado:
        resultado = f"No se ejecutó el {momento:%d/%m/%Y %H:%M}: la asignación del periodo está completada"
        repo.bitacora_add(periodo, usuario, "warn", f"{nombre} programada: {resultado}")
        _avanzar(prog, momento, UltimoResultado=resultado, UltimoNivel="warn")
        return
    except procesos.ProcesoEnCurso:
        resultado = f"En espera desde {vencimiento:%H:%M}: hay otro proceso en curso; se reintenta cada 5 min"
        if retraso < timedelta(seconds=INTERVALO_SEG * 2):  # avisar en bitácora solo en el primer intento
            repo.bitacora_add(periodo, usuario, "warn", f"{nombre} programada: {resultado}")
        repo.prog_actualizar(tipo, ProximaEjecucion=momento + REINTENTO, UltimoResultado=resultado, UltimoNivel="warn")
        return
    _avanzar(prog, momento, UltimaEjecucion=momento, UltimoProcesoId=id_,
             UltimoResultado=f"Se ejecutó el {momento:%d/%m/%Y %H:%M}", UltimoNivel="ok")


def _tick() -> None:
    momento = ahora()
    for prog in repo.prog_vencidas(momento):
        try:
            _procesar(prog, momento)
        except Exception:
            log.exception("Error procesando la programación %s", prog["Tipo"])


def _loop() -> None:
    while True:
        try:
            _tick()
        except Exception:
            log.exception("Error en el planificador")
        if _stop.wait(INTERVALO_SEG):
            return


def iniciar() -> None:
    _stop.clear()
    threading.Thread(target=_loop, daemon=True, name="planificador").start()


def detener() -> None:
    _stop.set()
