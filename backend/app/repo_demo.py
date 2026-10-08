"""Repositorio en memoria para el modo demo (DEMO_MODE=true): mismas funciones que repo.py, sin SQL Server.

`repo.py` lo importa al final y sobreescribe sus funciones, así el resto de la app no sabe que es demo.
Los SPs se simulan con una pausa corta y cambiando el estado en memoria; todo se pierde al reiniciar el backend.
"""
import random
import threading
import time
from datetime import date, datetime, timedelta

from .config import settings
from .periodo import ahora, anterior, periodo_actual, periodo_insumos
from .security import hash_password

__all__ = [
    "proceso_crear", "proceso_set_spid", "proceso_finalizar", "proceso_get", "proceso_en_curso", "proceso_ultimo",
    "procesos_listar", "procesos_por_dia", "duracion_promedio", "procesos_marcar_interrumpidos", "sesion_detalle",
    "validacion_registrar", "validacion_ultima", "bitacora_add", "bitacora_listar", "procesos_en_curso",
    "prog_listar", "prog_get", "prog_guardar", "prog_actualizar", "prog_eliminar", "prog_vencidas", "historico_periodos",
    "contar_periodos", "max_periodo", "contar_filas", "ejecutar_sp",
    "sin_asignar_contar", "sin_asignar_listar", "agencias_listar", "asignar_agencia", "equipo_editar", "asignados_manual_listar",
    "asignaciones_reaplicar", "asignacion_exportar",
    "cierre_get", "cierre_crear", "cierre_eliminar", "usuario_hash",
]

USUARIO_DEMO = "demo"
PASSWORD_DEMO = "demo"

# Segundos que "tarda" cada SP simulado (la mora real tarda ~40 min)
PAUSA = {"BAJAS": 5, "CAMBIO_TEC": 5, "MORA": 20, "ASIGNACION": 5}
FILAS_EXTRACCION = {"BAJAS": 17_800, "CAMBIO_TEC": 3_200}  # Bajas: +44% vs. el periodo previo → Advertencia
FILAS_MORA = 85_000
EQUIPOS = 60
EQUIPOS_SIN_AGENCIA = 14
_SPID = 57
# Las cantidades fijas de arriba son las del periodo real (el punto de partida documentado). Al pasar a otro periodo
# con "Siguiente periodo" se varían al azar, con una semilla por periodo: reejecutar da el mismo resultado.
_PERIODO_INICIAL = periodo_actual()

_lock = threading.RLock()

# Estado en memoria
_procesos: list[dict] = []
_validaciones: list[dict] = []
_bitacora: list[dict] = []
_progs: dict[str, dict] = {}
_cierres: dict[str, dict] = {}
_insumos: dict[str, dict[str, int]] = {"BAJAS": {}, "CAMBIO_TEC": {}}  # clave → {periodo: filas}
_mora_filas = 0
_asignacion: list[dict] = []
_manuales: list[dict] = []  # historial de agencias asignadas a mano (AppAsignacionesManuales)
_seq = {"proceso": 0, "validacion": 0, "bitacora": 0}

_COLS_PROG = ("Tipo", "Modo", "FechaHora", "DiaMes", "Hora", "Activa", "ProximaEjecucion", "VencimientoOriginal",
              "UltimaEjecucion", "UltimoProcesoId", "UltimoResultado", "UltimoNivel", "CreadoPor", "CreadoEn")


def _col(nombre: str) -> str:
    return nombre.strip().strip("[]")


def _col_id() -> str:
    return _col(settings.ASIGNACION_COLUMNA_ID)


def _col_agencia() -> str:
    return _col(settings.ASIGNACION_COLUMNA_AGENCIA)


def _visibles() -> list[str]:
    return [_col(c) for c in settings.ASIGNACION_COLUMNAS_VISIBLES.split(",")]


def _clave_insumo(tabla: str) -> str:
    return "BAJAS" if tabla == settings.BAJAS_TABLA else "CAMBIO_TEC"


def _azar(clave: str) -> random.Random | None:
    """Generador determinista para el periodo actual; None en el periodo inicial (se usan las cantidades fijas)."""
    periodo = periodo_actual()
    return None if periodo == _PERIODO_INICIAL else random.Random(f"{periodo}-{clave}")


def _variar(base: int, rnd: random.Random, prob_alerta: float = 0.2) -> int:
    """Variación habitual de -12% a +15%; con `prob_alerta`, de 32% a 50% (supera el umbral de Advertencia)."""
    if rnd.random() < prob_alerta:
        delta = rnd.uniform(0.32, 0.5) * rnd.choice((1, -1))
    else:
        delta = rnd.uniform(-0.12, 0.15)
    return max(1, round(base * (1 + delta)))


def _siguiente(tabla: str) -> int:
    _seq[tabla] += 1
    return _seq[tabla]


# ---------- Procesos ----------

def proceso_crear(periodo: str, tipo: str, origen: str, usuario: str) -> int:
    with _lock:
        id_ = _siguiente("proceso")
        _procesos.append({"Id": id_, "Periodo": periodo, "Tipo": tipo, "Origen": origen, "Estado": "EN_PROCESO",
                          "Usuario": usuario, "Inicio": ahora(), "Fin": None, "DuracionMs": None, "Filas": None,
                          "Spid": None, "Error": None})
    return id_


def procesos_en_curso() -> list[dict]:
    with _lock:
        return [dict(p) for p in sorted((p for p in _procesos if p["Estado"] == "EN_PROCESO"),
                                        key=lambda p: (p["Inicio"], p["Id"]))]


def _proceso(id_: int) -> dict | None:
    return next((p for p in _procesos if p["Id"] == id_), None)


def proceso_set_spid(id_: int, spid: int) -> None:
    with _lock:
        _proceso(id_)["Spid"] = spid


def proceso_finalizar(id_: int, estado: str, duracion_ms: int, filas: int | None, error: str | None) -> None:
    with _lock:
        _proceso(id_).update(Estado=estado, Fin=ahora(), DuracionMs=duracion_ms, Filas=filas, Error=error)


def proceso_get(id_: int) -> dict | None:
    with _lock:
        p = _proceso(id_)
        return dict(p) if p else None


def proceso_en_curso() -> dict | None:
    with _lock:
        activos = [p for p in _procesos if p["Estado"] == "EN_PROCESO"]
        return dict(max(activos, key=lambda p: p["Inicio"])) if activos else None


def proceso_ultimo(periodo: str, tipo: str) -> dict | None:
    with _lock:
        coinciden = [p for p in _procesos if p["Periodo"] == periodo and p["Tipo"] == tipo]
        return dict(max(coinciden, key=lambda p: (p["Inicio"], p["Id"]))) if coinciden else None


def procesos_listar(tipo: str | None, limite: int) -> list[dict]:
    with _lock:
        filtrados = [p for p in _procesos if not tipo or p["Tipo"] == tipo]
        filtrados.sort(key=lambda p: (p["Inicio"], p["Id"]), reverse=True)
        return [dict(p) for p in filtrados[:limite]]


def procesos_por_dia(dias: int) -> list[dict]:
    desde = ahora().date() - timedelta(days=dias)
    por_dia: dict[date, dict] = {}
    with _lock:
        for p in _procesos:
            d = p["Inicio"].date()
            if d >= desde:
                r = por_dia.setdefault(d, {"Dia": d, "Ok": 0, "Error": 0})
                if p["Estado"] == "OK":
                    r["Ok"] += 1
                elif p["Estado"] == "ERROR":
                    r["Error"] += 1
    return [por_dia[d] for d in sorted(por_dia)]


def duracion_promedio(tipo: str, ultimas: int = 5) -> int | None:
    with _lock:
        ok = sorted((p for p in _procesos if p["Tipo"] == tipo and p["Estado"] == "OK"),
                    key=lambda p: p["Inicio"], reverse=True)[:ultimas]
    return int(sum(p["DuracionMs"] for p in ok) / len(ok)) if ok else None


def procesos_marcar_interrumpidos() -> int:
    with _lock:
        n = 0
        for p in _procesos:
            if p["Estado"] == "EN_PROCESO":
                p.update(Estado="ERROR", Fin=ahora(), Error="Interrumpido por reinicio del servidor")
                n += 1
        return n


def sesion_detalle(spid: int) -> dict | None:
    """Detalle ficticio de la sesión SQL para que se vea el panel de progreso."""
    with _lock:
        p = next((p for p in _procesos if p["Spid"] == spid and p["Estado"] == "EN_PROCESO"), None)
        if not p:
            return None
        transcurrido = int((ahora() - p["Inicio"]).total_seconds() * 1000)
    return {"Estado": "running", "Comando": "EXECUTE", "Espera": None, "BloqueadoPor": 0, "TranscurridoMs": transcurrido}


# ---------- Validaciones ----------

def validacion_registrar(periodo: str, insumo: str, estado: str, periodo_encontrado: str | None,
                         filas: int | None, filas_anterior: int | None, usuario: str, detalle: str) -> None:
    with _lock:
        _validaciones.append({"Id": _siguiente("validacion"), "Periodo": periodo, "Insumo": insumo, "Estado": estado,
                              "PeriodoEncontrado": periodo_encontrado, "Filas": filas,
                              "FilasPeriodoAnterior": filas_anterior, "Usuario": usuario, "Fecha": ahora(),
                              "Detalle": detalle})


def validacion_ultima(periodo: str, insumo: str) -> dict | None:
    with _lock:
        for v in reversed(_validaciones):
            if v["Periodo"] == periodo and v["Insumo"] == insumo:
                return {k: v[k] for k in ("Estado", "PeriodoEncontrado", "Filas", "FilasPeriodoAnterior", "Usuario",
                                          "Fecha", "Detalle")}
    return None


# ---------- Bitácora ----------

def bitacora_add(periodo: str, usuario: str, nivel: str, mensaje: str) -> None:
    with _lock:
        _bitacora.append({"Id": _siguiente("bitacora"), "Periodo": periodo, "Fecha": ahora(), "Usuario": usuario,
                          "Nivel": nivel, "Mensaje": mensaje[:1000]})


def bitacora_listar(periodo: str, limite: int = 100) -> list[dict]:
    with _lock:
        filas = [b for b in reversed(_bitacora) if b["Periodo"] == periodo][:limite]
        return [{k: b[k] for k in ("Id", "Fecha", "Usuario", "Nivel", "Mensaje")} for b in filas]


# ---------- Programaciones ----------

def prog_listar() -> list[dict]:
    with _lock:
        return [dict(p) for p in _progs.values()]


def prog_get(tipo: str) -> dict | None:
    with _lock:
        return dict(_progs[tipo]) if tipo in _progs else None


def prog_guardar(tipo: str, modo: str, fecha_hora: datetime | None, dia_mes: int | None, hora: str | None,
                 proxima: datetime, usuario: str) -> None:
    with _lock:
        p = _progs.setdefault(tipo, dict.fromkeys(_COLS_PROG))
        p.update(Tipo=tipo, Modo=modo, FechaHora=fecha_hora, DiaMes=dia_mes, Hora=hora, Activa=True,
                 ProximaEjecucion=proxima, VencimientoOriginal=proxima, UltimoResultado=None, UltimoNivel=None,
                 CreadoPor=usuario, CreadoEn=ahora())


def prog_actualizar(tipo: str, **campos) -> None:
    with _lock:
        if tipo in _progs:
            _progs[tipo].update(campos)


def prog_eliminar(tipo: str) -> None:
    with _lock:
        _progs.pop(tipo, None)


def prog_vencidas(momento: datetime) -> list[dict]:
    with _lock:
        return [dict(p) for p in _progs.values()
                if p["Activa"] and p["ProximaEjecucion"] and p["ProximaEjecucion"] <= momento]


# ---------- Histórico por periodo (Dashboard) ----------

def historico_periodos(desde: str) -> list[dict]:
    datos: dict[str, dict] = {}
    with _lock:
        for v in _validaciones:  # en orden: la última válida de cada periodo queda al final
            if v["Periodo"] >= desde and v["Estado"] in ("OK", "ADVERTENCIA"):
                datos.setdefault(v["Periodo"], {}).update({
                    v["Insumo"]: v["Filas"], f"{v['Insumo']}_ANTERIOR": v["FilasPeriodoAnterior"],
                    f"{v['Insumo']}_ESTADO": v["Estado"]})
        for pr in sorted(_procesos, key=lambda x: (x["Inicio"], x["Id"])):
            if pr["Periodo"] >= desde and pr["Tipo"] in ("MORA", "ASIGNACION") and pr["Estado"] == "OK":
                datos.setdefault(pr["Periodo"], {})[pr["Tipo"]] = pr["Filas"]
        manuales: dict[str, set] = {}
        for m in _manuales:
            if m["Periodo"] >= desde:
                manuales.setdefault(m["Periodo"], set()).add(m["EquipoId"])
        for periodo, ids in manuales.items():
            datos.setdefault(periodo, {})["Manuales"] = len(ids)
    return [{"Periodo": p, **v} for p, v in sorted(datos.items())]


# ---------- Objetos de negocio ----------

def contar_periodos(tabla: str, columna: str, periodos: list[str]) -> dict[str, int]:
    with _lock:
        datos = _insumos[_clave_insumo(tabla)]
        return {p: datos[p] for p in periodos if p in datos}


def max_periodo(tabla: str, columna: str) -> str | None:
    with _lock:
        datos = _insumos[_clave_insumo(tabla)]
        return max(datos) if datos else None


def contar_filas(tabla: str) -> int:
    with _lock:
        if tabla == settings.MORA_TABLA:
            return _mora_filas
        if tabla == settings.ASIGNACION_TABLA:
            return len(_asignacion)
        return sum(_insumos[_clave_insumo(tabla)].values())


def _filas_previas(tipo: str, defecto: int) -> int:
    """Filas del último proceso OK de `tipo` en un periodo anterior al actual (base estable aunque se reejecute)."""
    actual = periodo_actual()
    previas = [p for p in _procesos if p["Tipo"] == tipo and p["Estado"] == "OK" and p["Filas"]
               and p["Periodo"] < actual]
    return max(previas, key=lambda p: (p["Periodo"], p["Inicio"]))["Filas"] if previas else defecto


def _manuales_previos() -> int | None:
    """Equipos asignados a mano en el último periodo anterior al actual que los tenga."""
    actual = periodo_actual()
    anteriores = [m["Periodo"] for m in _manuales if m["Periodo"] < actual]
    if not anteriores:
        return None
    ultimo = max(anteriores)
    return len({m["EquipoId"] for m in _manuales if m["Periodo"] == ultimo})


def ejecutar_sp(nombre: str, param: str, valor: str | None, timeout: int, on_spid) -> int | None:
    """Simula el SP: pausa y cambia el estado en memoria. Devuelve las filas 'afectadas'."""
    global _mora_filas, _asignacion
    clave = {settings.SP_EXTRAER_BAJAS: "BAJAS", settings.SP_EXTRAER_CAMBIO_TEC: "CAMBIO_TEC",
             settings.SP_MORA: "MORA", settings.SP_ASIGNACION: "ASIGNACION"}[nombre]
    on_spid(_SPID)
    if clave == "MORA":
        with _lock:
            _mora_filas = 0  # el SP real trunca la tabla antes de cargar
    time.sleep(PAUSA[clave])
    rnd = _azar(clave)
    with _lock:
        if clave == "MORA":
            _mora_filas = _variar(_filas_previas("MORA", FILAS_MORA), rnd, prob_alerta=0) if rnd else FILAS_MORA
            return _mora_filas
        if clave == "ASIGNACION":
            if rnd:  # varían sobre el periodo anterior; los sin agencia pueden saltar de vez en cuando
                equipos = _variar(_filas_previas("ASIGNACION", EQUIPOS), rnd, prob_alerta=0)
                sin_agencia = min(max(_variar(_manuales_previos() or EQUIPOS_SIN_AGENCIA, rnd), 1), equipos - 1)
                _asignacion = _generar_asignacion(equipos, sin_agencia)
            else:
                _asignacion = _generar_asignacion(EQUIPOS, EQUIPOS_SIN_AGENCIA)
            return len(_asignacion)
        esperado = periodo_insumos()
        if rnd:
            base = _insumos[clave].get(anterior(esperado), FILAS_EXTRACCION[clave])
            filas = _variar(base, rnd)
        else:
            filas = FILAS_EXTRACCION[clave]
        _insumos[clave][esperado] = filas
        return filas


# ---------- Equipos sin agencia (toda la tabla de asignación) ----------

_MUNICIPIOS = {
    "Bogotá": ["Chapinero", "Suba", "Kennedy", "Usaquén"],
    "Medellín": ["El Poblado", "Laureles", "Belén", "Robledo"],
    "Cali": ["Granada", "San Fernando", "Ciudad Jardín", "Tequendama"],
    "Barranquilla": ["El Prado", "Riomar", "Boston", "Alto Prado"],
}
_DEPARTAMENTOS = {"Bogotá": "Cundinamarca", "Medellín": "Antioquia", "Cali": "Valle del Cauca",
                  "Barranquilla": "Atlántico"}
_AGENCIAS = [("AG01", "Agencia Norte"), ("AG02", "Agencia Sur"), ("AG03", "Agencia Centro"),
             ("AG04", "Agencia Occidente"), ("AG05", "Agencia Oriente"), ("AG06", "Agencia Costa")]


def _generar_asignacion(equipos: int, sin_agencia: int) -> list[dict]:
    """Equipos ficticios. Los 'sin agencia' tienen un barrio que no pertenece al municipio (el caso real del SP)."""
    municipios = list(_MUNICIPIOS)
    filas = []
    paso = max(1, equipos // max(1, sin_agencia))
    for n in range(equipos):
        municipio = municipios[n % len(municipios)]
        barrio = _MUNICIPIOS[municipio][(n // len(municipios)) % 4]
        agencia = _AGENCIAS[n % len(_AGENCIAS)][0]
        if n % paso == 0 and sum(f[_col_agencia()] is None for f in filas) < sin_agencia:
            barrio = _MUNICIPIOS[municipios[(n + 1) % len(municipios)]][0]  # barrio de otro municipio
            agencia = None
        fila = {"Contrato": f"CT{70000 + n * 37}", "Serie": f"SN{periodo_actual()}{n + 1:04d}",
                "Departamento": _DEPARTAMENTOS[municipio], "Municipio": municipio, "Barrio": barrio,
                "Direccion": f"Cra {10 + n} # {20 + n % 9}-{30 + n % 50}"}
        fila = {_col_id(): fila["Serie"], **{c: fila.get(c, f"{c} {n + 1}") for c in _visibles()}}
        fila[_col_agencia()] = agencia
        filas.append(fila)
    return filas


def sin_asignar_contar() -> int:
    with _lock:
        return sum(f[_col_agencia()] is None for f in _asignacion)


def sin_asignar_listar(limite: int) -> tuple[list[str], list[dict]]:
    visibles = _visibles()
    with _lock:
        pendientes = sorted((f for f in _asignacion if f[_col_agencia()] is None), key=lambda f: f[_col_id()])
        return visibles, [{"_id": f[_col_id()], **{c: f.get(c) for c in visibles}} for f in pendientes[:limite]]


def agencias_listar() -> list[dict]:
    return [{"valor": v, "nombre": n} for v, n in sorted(_AGENCIAS, key=lambda a: a[1])]


def asignar_agencia(ids: list[str], agencia: str, periodo: str, usuario: str) -> int:
    """Asigna la agencia a equipos sin agencia o ya asignados a mano en el periodo. Devuelve cuántos cambiaron."""
    pedidos = set(ids)
    total = 0
    with _lock:
        manuales = {m["EquipoId"] for m in _manuales if m["Periodo"] == periodo}
        for f in _asignacion:
            id_, actual = f[_col_id()], f[_col_agencia()]
            if id_ in pedidos and (actual is None or (actual != agencia and id_ in manuales)):
                f[_col_agencia()] = agencia
                _manuales.append({"Periodo": periodo, "EquipoId": id_, "AgenciaAnterior": actual,
                                  "AgenciaNueva": agencia, "Usuario": usuario, "Fecha": ahora()})
                total += 1
    return total


def equipo_editar(id_: str, valores: dict[str, str | None]) -> dict | None:
    with _lock:
        f = next((f for f in _asignacion if f[_col_id()] == id_ and f[_col_agencia()] is None), None)
        if not f:
            return None
        antes = {c: f.get(c) for c in valores}
        f.update(valores)
        return antes


def asignados_manual_listar(periodo: str, limite: int) -> tuple[list[str], list[dict]]:
    visibles = _visibles()
    with _lock:
        manuales = {m["EquipoId"] for m in _manuales if m["Periodo"] == periodo}
        filas = sorted((f for f in _asignacion if f[_col_id()] in manuales), key=lambda f: f[_col_id()])
        return visibles, [{"_id": f[_col_id()], "_agencia": f[_col_agencia()], **{c: f.get(c) for c in visibles}}
                          for f in filas[:limite]]


def asignaciones_reaplicar(periodo: str) -> tuple[int, int]:
    """Tras regenerar: reaplica la última agencia manual de cada equipo que quedó sin agencia."""
    with _lock:
        ultima = {m["EquipoId"]: m["AgenciaNueva"] for m in _manuales if m["Periodo"] == periodo}
        reaplicadas = 0
        for f in _asignacion:
            nueva = ultima.get(f[_col_id()])
            if nueva and f[_col_agencia()] is None:
                f[_col_agencia()] = nueva
                reaplicadas += 1
        return reaplicadas, len(ultima)


def asignacion_exportar(on_columnas, on_filas) -> int:
    columnas = list(dict.fromkeys([_col_id(), *_visibles(), _col_agencia()]))
    with _lock:
        filas = [[f.get(c) for c in columnas] for f in _asignacion]
    on_columnas(columnas)
    for i in range(0, len(filas), 5000):
        on_filas(filas[i:i + 5000])
    return len(filas)


# ---------- Cierre del periodo ----------

def cierre_get(periodo: str) -> dict | None:
    with _lock:
        return dict(_cierres[periodo]) if periodo in _cierres else None


def cierre_crear(periodo: str, usuario: str) -> None:
    with _lock:
        _cierres[periodo] = {"Periodo": periodo, "Usuario": usuario, "Fecha": ahora()}


def cierre_eliminar(periodo: str) -> None:
    with _lock:
        _cierres.pop(periodo, None)


# ---------- Usuarios ----------

_HASH_DEMO = hash_password(PASSWORD_DEMO)


def usuario_hash(username: str) -> str | None:
    return _HASH_DEMO if username == USUARIO_DEMO else None


# ---------- Datos iniciales ----------

def _semilla() -> None:
    esperado = periodo_insumos()
    # Bajas sigue en el periodo anterior (→ Error: hay que extraer); Cambio de tecnología ya está al día
    _insumos["CAMBIO_TEC"][esperado] = 3_250

    # 6 periodos pasados completos: dan histórico al Dashboard y un promedio para la barra de progreso.
    # Listas del más antiguo al más reciente; las de insumos tienen uno más (el previo del primero, para la variación).
    # Bajas salta +31% en uno y Cambio de tecnología cae -31% en otro (→ Advertencia); los asignados a mano bajan.
    bajas = [11_000, 11_200, 11_900, 15_600, 12_100, 12_600, 12_400]
    cambio_tec = [2_850, 2_900, 2_950, 3_000, 2_050, 2_400, 3_100]
    mora = [80_500, 81_900, 83_000, 82_400, 84_100, 84_700]
    equipos = [55, 58, 61, 57, 63, 60]
    manuales = [19, 17, 22, 15, 12, 11]

    periodos = [anterior(periodo_actual())]
    while len(periodos) < 7:
        periodos.insert(0, anterior(periodos[0]))
    # periodos[0] solo aporta el previo de la variación; periodos[1:] son los 6 periodos pasados. El dato de insumos
    # de cada periodo de asignación vive en su periodo de insumos (el mes anterior). El último (12.400) es el que
    # tiene Bajas al arrancar la demo.
    for clave, serie in (("BAJAS", bajas), ("CAMBIO_TEC", cambio_tec)):
        for periodo, filas in zip(periodos, serie):
            _insumos[clave][anterior(periodo)] = filas

    def proceso(periodo: str, tipo: str, inicio: datetime, ms: int, filas: int | None, error: str | None = None):
        _procesos.append({"Id": _siguiente("proceso"), "Periodo": periodo, "Tipo": tipo, "Origen": "MANUAL",
                          "Estado": "ERROR" if error else "OK", "Usuario": USUARIO_DEMO, "Inicio": inicio,
                          "Fin": inicio + timedelta(milliseconds=ms), "DuracionMs": ms, "Filas": filas,
                          "Spid": None, "Error": error})

    for n, periodo in enumerate(periodos[1:]):
        dia = datetime(int(periodo[:4]), int(periodo[4:]), 2 + n % 3, 9, 0)
        for clave, serie in (("BAJAS", bajas), ("CAMBIO_TEC", cambio_tec)):
            filas, filas_ant = serie[n + 1], serie[n]
            variacion = (filas - filas_ant) / filas_ant * 100
            alerta = abs(variacion) > settings.VARIACION_ALERTA_PCT
            proceso(periodo, f"EXTRAER_{clave}", dia, 4_800 + 300 * n, filas)
            _validaciones.append({
                "Id": _siguiente("validacion"), "Periodo": periodo, "Insumo": clave,
                "Estado": "ADVERTENCIA" if alerta else "OK", "PeriodoEncontrado": periodos[n], "Filas": filas,
                "FilasPeriodoAnterior": filas_ant, "Usuario": USUARIO_DEMO, "Fecha": dia + timedelta(minutes=5),
                "Detalle": f"Variación de {variacion:+.1f}% respecto al periodo anterior (dato de ejemplo)",
            })
        if n == len(mora) - 1:  # un error de ejemplo en el último periodo
            proceso(periodo, "MORA", dia + timedelta(hours=1), 9_000, None, "Tiempo de espera agotado (dato de ejemplo)")
        proceso(periodo, "MORA", dia + timedelta(hours=2), 20_000 + 500 * n, mora[n])
        proceso(periodo, "ASIGNACION", dia + timedelta(hours=3), 6_100, equipos[n])
        for i in range(manuales[n]):
            _manuales.append({"Periodo": periodo, "EquipoId": f"SN{periodo}{i + 1:04d}", "AgenciaAnterior": None,
                              "AgenciaNueva": _AGENCIAS[i % len(_AGENCIAS)][0], "Usuario": USUARIO_DEMO,
                              "Fecha": dia + timedelta(hours=4)})
        _cierres[periodo] = {"Periodo": periodo, "Usuario": USUARIO_DEMO, "Fecha": dia + timedelta(days=1)}


_semilla()
