"""Validación de los insumos que vienen del servidor origen (bajas y cambio de tecnología)."""
import logging
from dataclasses import dataclass

from . import repo
from .config import settings
from .periodo import anterior, periodo_actual, periodo_insumos

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Insumo:
    clave: str
    nombre: str
    tabla: str
    columna: str
    sp_extraer: str
    param_periodo: str
    tipo_proceso: str
    # True = si la extracción terminó OK pero el periodo no tiene filas, cuenta como OK (hay meses sin datos)
    opcional_si_vacio: bool = False


INSUMOS: dict[str, Insumo] = {
    "BAJAS": Insumo(
        "BAJAS", "Bajas", settings.BAJAS_TABLA, settings.BAJAS_COLUMNA_PERIODO,
        settings.SP_EXTRAER_BAJAS, settings.SP_EXTRAER_BAJAS_PARAM_PERIODO, "EXTRAER_BAJAS",
    ),
    "CAMBIO_TEC": Insumo(
        "CAMBIO_TEC", "Cambio de tecnología", settings.CAMBIO_TEC_TABLA, settings.CAMBIO_TEC_COLUMNA_PERIODO,
        settings.SP_EXTRAER_CAMBIO_TEC, settings.SP_EXTRAER_CAMBIO_TEC_PARAM_PERIODO, "EXTRAER_CAMBIO_TEC",
        opcional_si_vacio=True,  # hay periodos sin cambios de tecnología
    ),
}

ESTADOS_VALIDOS = ("OK", "ADVERTENCIA")


def es_valida(validacion: dict | None) -> bool:
    return bool(validacion) and validacion["Estado"] in ESTADOS_VALIDOS


# Orden de presentación (se extraen a la vez: no dependen entre sí). Clave → tipo de proceso.
ORDEN = ("BAJAS", "CAMBIO_TEC", "MORA")
TIPO_PROCESO = {**{k: i.tipo_proceso for k, i in INSUMOS.items()}, "MORA": "MORA"}
NOMBRES = {**{k: i.nombre for k, i in INSUMOS.items()}, "MORA": "Mora"}


def mora_lista(mora: dict | None) -> bool:
    return bool(mora and mora["Estado"] == "OK" and mora["Filas"])


def vigente(periodo: str, clave: str) -> bool:
    """El insumo está listo: OK o Advertencia (o vacío permitido) / mora OK con filas."""
    if clave == "MORA":
        return mora_lista(repo.proceso_ultimo(periodo, "MORA"))
    return es_valida(repo.validacion_ultima(periodo, clave))


def bloqueos_generar(validaciones: dict[str, dict | None], mora: dict | None) -> list[str]:
    """Motivos por los que aún no se puede generar la asignación (sin contar si hay un proceso en curso).

    Bajas y Mora son obligatorias; Cambio de tecnología también, salvo que su extracción haya venido vacía (eso ya
    lo resuelve `validar`, que la deja en OK). La Advertencia no bloquea."""
    bloqueos = []
    for ins in INSUMOS.values():
        v = validaciones.get(ins.clave)
        if not v:
            bloqueos.append(f"{ins.nombre}: sin validar")
        elif not es_valida(v):
            bloqueos.append(f"{ins.nombre}: {v['Detalle']}")
    if not mora or mora["Estado"] != "OK":
        bloqueos.append("Mora: no se ha generado en este periodo")
    elif not mora["Filas"]:
        bloqueos.append("Mora: la tabla quedó vacía")
    return bloqueos


def validar(clave: str, usuario: str) -> dict:
    """Consulta la tabla del insumo, registra el resultado y lo devuelve."""
    ins = INSUMOS[clave]
    periodo = periodo_actual()
    esperado = periodo_insumos(periodo)
    previo = anterior(esperado)
    filas = filas_previo = encontrado = None

    try:
        conteos = repo.contar_periodos(ins.tabla, ins.columna, [esperado, previo])
        filas = conteos.get(esperado, 0)
        filas_previo = conteos.get(previo)
        if filas > 0:
            encontrado = esperado
            variacion = (filas - filas_previo) / filas_previo * 100 if filas_previo else None
            if variacion is not None and abs(variacion) > settings.VARIACION_ALERTA_PCT:
                estado = "ADVERTENCIA"
                detalle = f"Variación de {variacion:+.0f}% respecto a {previo}"
            else:
                estado = "OK"
                detalle = f"Periodo {esperado} con {filas:,} filas".replace(",", ".")
        elif ins.opcional_si_vacio and _extraccion_ok(periodo, ins):
            # Se extrajo bien y el periodo no trae filas: hay meses sin datos, no es un error
            estado = "OK"
            detalle = f"Sin {ins.nombre.lower()} en el periodo {esperado} (0 filas)"
        else:
            encontrado = repo.max_periodo(ins.tabla, ins.columna)
            estado = "ERROR"
            detalle = f"Se esperaba {esperado}, la tabla tiene {encontrado or 'sin datos'}"
    except Exception:
        log.exception("Error validando %s", clave)
        estado = "ERROR"
        detalle = "No se pudo consultar la tabla del insumo"

    repo.validacion_registrar(periodo, clave, estado, encontrado, filas, filas_previo, usuario, detalle)
    nivel = {"OK": "ok", "ADVERTENCIA": "warn"}.get(estado, "error")
    repo.bitacora_add(periodo, usuario, nivel, f"Validación {ins.nombre}: {detalle}")
    return repo.validacion_ultima(periodo, clave)


def _extraccion_ok(periodo: str, ins: Insumo) -> bool:
    p = repo.proceso_ultimo(periodo, ins.tipo_proceso)
    return bool(p and p["Estado"] == "OK")
