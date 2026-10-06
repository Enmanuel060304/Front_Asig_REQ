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


INSUMOS: dict[str, Insumo] = {
    "BAJAS": Insumo(
        "BAJAS", "Bajas", settings.BAJAS_TABLA, settings.BAJAS_COLUMNA_PERIODO,
        settings.SP_EXTRAER_BAJAS, settings.SP_EXTRAER_BAJAS_PARAM_PERIODO, "EXTRAER_BAJAS",
    ),
    "CAMBIO_TEC": Insumo(
        "CAMBIO_TEC", "Cambio de tecnología", settings.CAMBIO_TEC_TABLA, settings.CAMBIO_TEC_COLUMNA_PERIODO,
        settings.SP_EXTRAER_CAMBIO_TEC, settings.SP_EXTRAER_CAMBIO_TEC_PARAM_PERIODO, "EXTRAER_CAMBIO_TEC",
    ),
}

ESTADOS_VALIDOS = ("OK", "ADVERTENCIA")


def es_valida(validacion: dict | None) -> bool:
    return bool(validacion) and validacion["Estado"] in ESTADOS_VALIDOS


def bloqueos_generar(validaciones: dict[str, dict | None], mora: dict | None) -> list[str]:
    """Motivos por los que aún no se puede generar la asignación (sin contar si hay un proceso en curso)."""
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
