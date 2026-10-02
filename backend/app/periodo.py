"""Periodos YYYYMM y hora local de la app."""
import calendar
from datetime import datetime, time
from zoneinfo import ZoneInfo

from .config import settings

_TZ = ZoneInfo(settings.APP_TIMEZONE)


def ahora() -> datetime:
    """Hora local de la app, sin tzinfo (así se guarda en SQL Server)."""
    return datetime.now(_TZ).replace(tzinfo=None, microsecond=0)


def periodo_de(d: datetime) -> str:
    return f"{d.year}{d.month:02d}"


def periodo_actual() -> str:
    """Periodo de la asignación: el mes en curso."""
    return periodo_de(ahora())


def anterior(periodo: str) -> str:
    y, m = int(periodo[:4]), int(periodo[4:])
    return f"{y - 1}12" if m == 1 else f"{y}{m - 1:02d}"


def periodo_insumos(periodo: str | None = None) -> str:
    """Los insumos deben traer el mes anterior al de la asignación."""
    return anterior(periodo or periodo_actual())


def proxima_mensual(dia: int, hora: time, desde: datetime) -> datetime:
    """Próxima fecha con día `dia` (o el último día si el mes es más corto) a `hora`, posterior a `desde`."""
    y, m = desde.year, desde.month
    for _ in range(2):
        d = min(dia, calendar.monthrange(y, m)[1])
        candidato = datetime(y, m, d, hora.hour, hora.minute)
        if candidato > desde:
            return candidato
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    raise AssertionError("inalcanzable")
