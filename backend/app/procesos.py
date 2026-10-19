"""Ejecutor de procesos largos (extracciones, mora, asignación) en segundo plano.

Una sola operación a la vez (lock global): un proceso suelto o el flujo completo. Dentro del flujo, los 3 insumos se
extraen en paralelo y la asignación corre después, sola: lee las tablas que los otros procesos truncan/cargan.
El estado vive en dbo.AppProcesos para que el front lo consulte y sobreviva al cierre del navegador.
"""
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait
from contextlib import contextmanager
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


class NadaPorHacer(Exception):
    """El flujo no tiene nada que hacer: los insumos están listos y la asignación ya está generada."""


class PeriodoCerrado(Exception):
    pass


NOMBRE_SECUENCIA = "Extracción y generación de la asignación"

_lock = threading.Lock()
_secuencia: dict | None = None  # estado del flujo en curso (solo mientras corre): fase y procesos en vuelo


def nombre(tipo: str) -> str:
    """Nombre legible de un proceso o de la secuencia de insumos (que no es un proceso en sí)."""
    return NOMBRE_SECUENCIA if tipo == "INSUMOS" else TIPOS[tipo].nombre


def secuencia_estado() -> dict | None:
    s = _secuencia
    return {"fase": s["fase"], "actuales": list(s["actuales"])} if s else None


def ocupado() -> bool:
    """Hay un proceso o una secuencia en curso (la secuencia retiene el lock también entre pasos)."""
    return _lock.locked() or bool(repo.proceso_en_curso())


@contextmanager
def exclusivo():
    """Retiene el lock mientras corre una operación corta y síncrona (p. ej. el SP de completar), para que nadie
    lance un proceso que toque las mismas tablas. Lanza ProcesoEnCurso si ya hay algo en curso."""
    if not _lock.acquire(blocking=False):
        raise ProcesoEnCurso()
    try:
        if repo.proceso_en_curso():
            raise ProcesoEnCurso()
        yield
    finally:
        _lock.release()


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
    try:
        _correr(id_, tipo, periodo, usuario, origen)
    finally:
        _lock.release()


def _correr(id_: int, tipo: str, periodo: str, usuario: str, origen: str, suelto: bool = True) -> str:
    """Ejecuta el SP del proceso ya creado y registra el resultado. Devuelve 'OK' o 'ERROR'. No toca el lock.

    Es seguro correr varios a la vez (cada llamada a repo abre su conexión). `suelto=False` dentro del flujo: ahí no
    se avisa "insumos listos" porque el flujo genera la asignación solo."""
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
        if tipo == "ASIGNACION":
            _reaplicar_manuales(periodo, usuario)  # antes de finalizar: nadie asigna mientras sigue EN_PROCESO
            # Toda la base (lo nuevo + lo pendiente), lo mismo que se exporta; no depende de SET NOCOUNT del SP
            filas = repo.contar_filas(settings.ASIGNACION_TABLA)
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
            if tipo != "ASIGNACION" and suelto:
                _avisar_si_listo(periodo, usuario)
        else:
            repo.bitacora_add(periodo, usuario, "error", f"{t.nombre} falló: {error}")
    except Exception:
        log.exception("Error registrando el fin del proceso %s", id_)
    return estado


def iniciar_secuencia(usuario: str, origen: str = "MANUAL") -> None:
    """Flujo completo en un hilo: extrae en paralelo los insumos que falten y, si quedan válidos, genera la asignación.

    Retiene el lock de principio a fin, así ningún proceso suelto se cuela entre la extracción y la generación.
    Lanza ProcesoEnCurso, PeriodoCerrado o NadaPorHacer (insumos listos y asignación ya generada).
    """
    if not _lock.acquire(blocking=False):
        raise ProcesoEnCurso()
    try:
        if repo.proceso_en_curso():
            raise ProcesoEnCurso()
        periodo = periodo_actual()
        if repo.cierre_get(periodo):
            raise PeriodoCerrado()
        if _asignacion_ok(periodo) and all(insumos.vigente(periodo, k) for k in insumos.ORDEN):
            raise NadaPorHacer()
    except BaseException:
        _lock.release()
        raise
    threading.Thread(target=_ejecutar_flujo, args=(periodo, usuario, origen), daemon=True,
                     name="flujo-asignacion").start()


def _asignacion_ok(periodo: str) -> bool:
    p = repo.proceso_ultimo(periodo, "ASIGNACION")
    return bool(p and p["Estado"] == "OK")


def _pendientes(periodo: str, usuario: str) -> list[str]:
    """Claves por extraer. Bajas y Cambio de tecnología se revalidan contra su tabla; la mora se mira por su proceso."""
    pendientes = []
    for clave in insumos.ORDEN:
        if clave != "MORA":
            insumos.validar(clave, usuario)
        if insumos.vigente(periodo, clave):
            repo.bitacora_add(periodo, usuario, "info", f"{insumos.NOMBRES[clave]} omitido: ya está listo en el periodo")
        else:
            pendientes.append(clave)
    return pendientes


def _extraer_en_paralelo(periodo: str, claves: list[str], usuario: str, origen: str) -> dict[str, int]:
    """Crea un proceso por insumo y los corre a la vez; vuelve cuando terminaron todos (OK o error).

    Devuelve clave → Id del proceso, para explicar después qué falló."""
    def uno(tipo: str, id_: int) -> None:
        try:
            _correr(id_, tipo, periodo, usuario, origen, suelto=False)
        finally:
            _secuencia["actuales"].remove(tipo)

    tipos = [insumos.TIPO_PROCESO[c] for c in claves]
    ids = [repo.proceso_crear(periodo, tipo, origen, usuario) for tipo in tipos]
    _secuencia["actuales"].extend(tipos)
    with ThreadPoolExecutor(max_workers=len(tipos), thread_name_prefix="extraccion") as pool:
        futuros = [pool.submit(uno, tipo, id_) for tipo, id_ in zip(tipos, ids)]
        wait(futuros)
    for f in futuros:
        if f.exception():  # _correr ya registra sus errores: esto sería un fallo inesperado del hilo
            log.error("Error inesperado en una extracción del flujo", exc_info=f.exception())
    return dict(zip(claves, ids))


def _motivos_flujo(periodo: str, ids: dict[str, int]) -> list[str]:
    """Por qué no se puede generar. Si la extracción de un insumo falló en este flujo, se dice eso (con su error)
    en lugar del estado que dejó la validación ("se esperaba…")."""
    motivos = []
    fallidos = set()
    for clave, id_ in ids.items():
        p = repo.proceso_get(id_)
        if p and p["Estado"] != "OK":
            fallidos.add(insumos.NOMBRES[clave])
            accion = "La mora falló" if clave == "MORA" else f"La extracción de {insumos.NOMBRES[clave]} falló"
            motivos.append(f"{accion}: {p['Error'] or 'sin detalle'}")
    validaciones = {k: repo.validacion_ultima(periodo, k) for k in insumos.INSUMOS}
    for m in insumos.bloqueos_generar(validaciones, repo.proceso_ultimo(periodo, "MORA")):
        if m.split(":")[0] not in fallidos:
            motivos.append(m)
    return motivos


def _ejecutar_flujo(periodo: str, usuario: str, origen: str) -> None:
    global _secuencia
    _secuencia = {"fase": "EXTRACCION", "actuales": []}
    try:
        repo.bitacora_add(periodo, usuario, "info",
                          f"Inició {NOMBRE_SECUENCIA.lower()}" + (" (programado)" if origen == "PROGRAMADO" else ""))
        pendientes = _pendientes(periodo, usuario)
        ids = {}
        if pendientes:
            repo.bitacora_add(periodo, usuario, "info",
                              "Extrayendo a la vez: " + ", ".join(insumos.NOMBRES[k] for k in pendientes))
            ids = _extraer_en_paralelo(periodo, pendientes, usuario, origen)

        # Bajas y Mora obligatorias; Cambio de tecnología válido o vacío (eso ya lo resolvió validar)
        motivos = _motivos_flujo(periodo, ids)
        if motivos:
            repo.bitacora_add(periodo, usuario, "error",
                              "Flujo detenido: no se generó la asignación. " + "; ".join(motivos))
            return
        if _asignacion_ok(periodo):
            repo.bitacora_add(periodo, usuario, "info",
                              "Insumos listos. Ya hay una asignación generada en el periodo: usa Regenerar en el paso 2")
            return

        _secuencia = {"fase": "ASIGNACION", "actuales": ["ASIGNACION"]}
        id_ = repo.proceso_crear(periodo, "ASIGNACION", origen, usuario)
        if _correr(id_, "ASIGNACION", periodo, usuario, origen, suelto=False) == "OK":
            repo.bitacora_add(periodo, usuario, "ok", f"{NOMBRE_SECUENCIA} completa")
        else:
            repo.bitacora_add(periodo, usuario, "error", "Flujo detenido: la generación de la asignación falló")
    except Exception:
        log.exception("Error en el flujo de asignación")
        try:
            repo.bitacora_add(periodo, usuario, "error", f"{NOMBRE_SECUENCIA} detenida por un error inesperado")
        except Exception:
            pass
    finally:
        _secuencia = None
        _lock.release()


def _avisar_si_listo(periodo: str, usuario: str) -> None:
    """Proceso suelto: si con él los insumos quedaron completos, deja constancia de que se puede generar."""
    asignacion = repo.proceso_ultimo(periodo, "ASIGNACION")
    if (asignacion and asignacion["Estado"] == "OK") or repo.cierre_get(periodo):
        return
    validaciones = {clave: repo.validacion_ultima(periodo, clave) for clave in insumos.INSUMOS}
    if not insumos.bloqueos_generar(validaciones, repo.proceso_ultimo(periodo, "MORA")):
        repo.bitacora_add(periodo, usuario, "ok", "Insumos listos: genera la asignación en el paso 2")


def _reaplicar_manuales(periodo: str, usuario: str) -> None:
    """Tras regenerar, vuelve a poner las agencias asignadas a mano a los equipos que el SP dejó sin agencia."""
    try:
        reaplicadas, total = repo.asignaciones_reaplicar(periodo)
        if total:
            repo.bitacora_add(periodo, usuario, "ok" if reaplicadas == total else "warn",
                              f"Reaplicó {reaplicadas} de {total} asignaciones manuales de agencia"
                              + ("" if reaplicadas == total else
                                 " (el resto ya tiene agencia del SP o ya no está en la asignación)"))
    except Exception:
        log.exception("No se pudieron reaplicar las asignaciones manuales")
        repo.bitacora_add(periodo, usuario, "error", "No se pudieron reaplicar las asignaciones manuales de agencia")


def _fmt_duracion(ms: int) -> str:
    return f"{ms / 1000:.0f} s" if ms < 60_000 else f"{ms / 60_000:.1f} min"


def recuperar_al_iniciar() -> None:
    n = repo.procesos_marcar_interrumpidos()
    if n:
        repo.bitacora_add(periodo_actual(), "sistema", "error",
                          f"{n} proceso(s) quedaron interrumpidos por un reinicio del servidor")
