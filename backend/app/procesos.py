"""Ejecutor de procesos largos (extracciones, mora, asignación) en segundo plano.

Solo corre un proceso a la vez: la asignación lee las tablas que los otros procesos truncan/cargan.
El estado vive en dbo.AppProcesos para que el front lo consulte y sobreviva al cierre del navegador.
"""
import logging
import threading
import time
from dataclasses import dataclass

from . import insumos, repo
from .config import settings
from .periodo import periodo_actual, periodo_insumos

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TipoProceso:
    nombre: str
    sp: str
    param_periodo: str
    timeout: int
    insumo: str | None = None  # si es una extracción, el insumo a revalidar al terminar


TIPOS: dict[str, TipoProceso] = {
    **{
        ins.tipo_proceso: TipoProceso(f"Extracción {ins.nombre}", ins.sp_extraer, ins.param_periodo,
                                      settings.EXTRACCION_TIMEOUT_SECONDS, ins.clave)
        for ins in insumos.INSUMOS.values()
    },
    "MORA": TipoProceso("Mora", settings.SP_MORA, "", settings.MORA_TIMEOUT_SECONDS),
    "ASIGNACION": TipoProceso("Asignación", settings.SP_ASIGNACION, "", settings.ASIGNACION_TIMEOUT_SECONDS),
}


class ProcesoEnCurso(Exception):
    pass


_lock = threading.Lock()


def iniciar(tipo: str, usuario: str, origen: str = "MANUAL") -> int:
    """Lanza el proceso en un hilo y devuelve su Id. Lanza ProcesoEnCurso si ya hay otro."""
    if not _lock.acquire(blocking=False):
        raise ProcesoEnCurso()
    try:
        if repo.proceso_en_curso():
            raise ProcesoEnCurso()
        periodo = periodo_actual()
        id_ = repo.proceso_crear(periodo, tipo, origen, usuario)
    except BaseException:
        _lock.release()
        raise
    threading.Thread(target=_ejecutar, args=(id_, tipo, periodo, usuario, origen), daemon=True,
                     name=f"proceso-{tipo}-{id_}").start()
    return id_


def _ejecutar(id_: int, tipo: str, periodo: str, usuario: str, origen: str) -> None:
    t = TIPOS[tipo]
    t0 = time.perf_counter()
    try:
        repo.bitacora_add(periodo, usuario, "info",
                          f"Inició {t.nombre}" + (" (programado)" if origen == "PROGRAMADO" else ""))
    except Exception:
        log.exception("No se pudo registrar el inicio en bitácora")
    try:
        filas = repo.ejecutar_sp(
            t.sp, t.param_periodo, periodo_insumos(periodo), t.timeout,
            on_spid=lambda spid: repo.proceso_set_spid(id_, spid),
        )
        if tipo == "MORA":
            filas = repo.contar_filas(settings.MORA_TABLA)
        estado, error = "OK", None
    except Exception as e:
        log.exception("Error ejecutando %s", t.sp)
        filas, estado, error = None, "ERROR", str(e)[:4000]

    duracion = int((time.perf_counter() - t0) * 1000)
    try:
        repo.proceso_finalizar(id_, estado, duracion, filas, error)
        if estado == "OK":
            detalle = f"{filas:,} filas".replace(",", ".") if filas is not None else "sin conteo de filas"
            repo.bitacora_add(periodo, usuario, "ok", f"{t.nombre} terminó OK en {_fmt_duracion(duracion)} ({detalle})")
            if t.insumo:
                insumos.validar(t.insumo, usuario)
        else:
            repo.bitacora_add(periodo, usuario, "error", f"{t.nombre} falló: {error}")
    except Exception:
        log.exception("Error registrando el fin del proceso %s", id_)
    finally:
        _lock.release()


def _fmt_duracion(ms: int) -> str:
    return f"{ms / 1000:.0f} s" if ms < 60_000 else f"{ms / 60_000:.1f} min"


def recuperar_al_iniciar() -> None:
    n = repo.procesos_marcar_interrumpidos()
    if n:
        repo.bitacora_add(periodo_actual(), "sistema", "error",
                          f"{n} proceso(s) quedaron interrumpidos por un reinicio del servidor")
