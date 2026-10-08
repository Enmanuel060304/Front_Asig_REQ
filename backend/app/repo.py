"""Acceso a SQL Server: tablas de la app (procesos, validaciones, bitácora, programaciones)
y operaciones sobre los objetos de negocio (SPs e insumos)."""
from datetime import datetime

from .config import settings
from .db import get_connection
from .periodo import ahora


def _filas(cur) -> list[dict]:
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _una(cur) -> dict | None:
    rows = _filas(cur)
    return rows[0] if rows else None


# ---------- Procesos ----------

_COLS_PROCESO = "Id, Periodo, Tipo, Origen, Estado, Usuario, Inicio, Fin, DuracionMs, Filas, Spid, Error"


def proceso_crear(periodo: str, tipo: str, origen: str, usuario: str) -> int:
    with get_connection() as conn:
        id_ = conn.cursor().execute(
            "INSERT INTO dbo.AppProcesos (Periodo, Tipo, Origen, Estado, Usuario, Inicio) "
            "OUTPUT INSERTED.Id VALUES (?, ?, ?, 'EN_PROCESO', ?, ?)",
            periodo, tipo, origen, usuario, ahora(),
        ).fetchval()
        conn.commit()
    return id_


def proceso_set_spid(id_: int, spid: int) -> None:
    with get_connection() as conn:
        conn.cursor().execute("UPDATE dbo.AppProcesos SET Spid = ? WHERE Id = ?", spid, id_)
        conn.commit()


def proceso_finalizar(id_: int, estado: str, duracion_ms: int, filas: int | None, error: str | None) -> None:
    with get_connection() as conn:
        conn.cursor().execute(
            "UPDATE dbo.AppProcesos SET Estado = ?, Fin = ?, DuracionMs = ?, Filas = ?, Error = ? WHERE Id = ?",
            estado, ahora(), duracion_ms, filas, error, id_,
        )
        conn.commit()


def proceso_get(id_: int) -> dict | None:
    with get_connection() as conn:
        return _una(conn.cursor().execute(f"SELECT {_COLS_PROCESO} FROM dbo.AppProcesos WHERE Id = ?", id_))


def proceso_en_curso() -> dict | None:
    with get_connection() as conn:
        return _una(conn.cursor().execute(
            f"SELECT TOP 1 {_COLS_PROCESO} FROM dbo.AppProcesos WHERE Estado = 'EN_PROCESO' ORDER BY Inicio DESC"
        ))


def procesos_en_curso() -> list[dict]:
    """Todos los EN_PROCESO: dentro del flujo, los insumos se extraen a la vez."""
    with get_connection() as conn:
        return _filas(conn.cursor().execute(
            f"SELECT {_COLS_PROCESO} FROM dbo.AppProcesos WHERE Estado = 'EN_PROCESO' ORDER BY Inicio, Id"
        ))


def proceso_ultimo(periodo: str, tipo: str) -> dict | None:
    with get_connection() as conn:
        return _una(conn.cursor().execute(
            f"SELECT TOP 1 {_COLS_PROCESO} FROM dbo.AppProcesos WHERE Periodo = ? AND Tipo = ? ORDER BY Inicio DESC",
            periodo, tipo,
        ))


def procesos_listar(tipo: str | None, limite: int) -> list[dict]:
    sql = f"SELECT TOP (?) {_COLS_PROCESO} FROM dbo.AppProcesos"
    params: list = [limite]
    if tipo:
        sql += " WHERE Tipo = ?"
        params.append(tipo)
    with get_connection() as conn:
        return _filas(conn.cursor().execute(sql + " ORDER BY Inicio DESC", *params))


def procesos_por_dia(dias: int) -> list[dict]:
    with get_connection() as conn:
        return _filas(conn.cursor().execute(
            "SELECT CAST(Inicio AS date) AS Dia, "
            "SUM(CASE WHEN Estado = 'OK' THEN 1 ELSE 0 END) AS Ok, "
            "SUM(CASE WHEN Estado = 'ERROR' THEN 1 ELSE 0 END) AS Error "
            "FROM dbo.AppProcesos WHERE Inicio >= DATEADD(day, -?, CAST(? AS date)) "
            "GROUP BY CAST(Inicio AS date) ORDER BY Dia",
            dias, ahora(),
        ))


def duracion_promedio(tipo: str, ultimas: int = 5) -> int | None:
    with get_connection() as conn:
        return conn.cursor().execute(
            "SELECT AVG(CAST(DuracionMs AS BIGINT)) FROM ("
            " SELECT TOP (?) DuracionMs FROM dbo.AppProcesos WHERE Tipo = ? AND Estado = 'OK' ORDER BY Inicio DESC"
            ") t",
            ultimas, tipo,
        ).fetchval()


def procesos_marcar_interrumpidos() -> int:
    with get_connection() as conn:
        n = conn.cursor().execute(
            "UPDATE dbo.AppProcesos SET Estado = 'ERROR', Fin = ?, "
            "Error = 'Interrumpido por reinicio del servidor' WHERE Estado = 'EN_PROCESO'",
            ahora(),
        ).rowcount
        conn.commit()
    return n


def sesion_detalle(spid: int) -> dict | None:
    """Estado en vivo de la sesión SQL (requiere VIEW SERVER STATE; si no hay permiso devuelve None)."""
    try:
        with get_connection() as conn:
            return _una(conn.cursor().execute(
                "SELECT status AS Estado, command AS Comando, wait_type AS Espera, "
                "blocking_session_id AS BloqueadoPor, total_elapsed_time AS TranscurridoMs "
                "FROM sys.dm_exec_requests WHERE session_id = ?",
                spid,
            ))
    except Exception:
        return None


# ---------- Validaciones ----------

def validacion_registrar(periodo: str, insumo: str, estado: str, periodo_encontrado: str | None,
                         filas: int | None, filas_anterior: int | None, usuario: str, detalle: str) -> None:
    with get_connection() as conn:
        conn.cursor().execute(
            "INSERT INTO dbo.AppValidaciones "
            "(Periodo, Insumo, Estado, PeriodoEncontrado, Filas, FilasPeriodoAnterior, Usuario, Fecha, Detalle) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            periodo, insumo, estado, periodo_encontrado, filas, filas_anterior, usuario, ahora(), detalle,
        )
        conn.commit()


def validacion_ultima(periodo: str, insumo: str) -> dict | None:
    with get_connection() as conn:
        return _una(conn.cursor().execute(
            "SELECT TOP 1 Estado, PeriodoEncontrado, Filas, FilasPeriodoAnterior, Usuario, Fecha, Detalle "
            "FROM dbo.AppValidaciones WHERE Periodo = ? AND Insumo = ? ORDER BY Fecha DESC, Id DESC",
            periodo, insumo,
        ))


# ---------- Bitácora ----------

def bitacora_add(periodo: str, usuario: str, nivel: str, mensaje: str) -> None:
    with get_connection() as conn:
        conn.cursor().execute(
            "INSERT INTO dbo.AppBitacora (Periodo, Fecha, Usuario, Nivel, Mensaje) VALUES (?, ?, ?, ?, ?)",
            periodo, ahora(), usuario, nivel, mensaje[:1000],
        )
        conn.commit()


def bitacora_listar(periodo: str, limite: int = 100) -> list[dict]:
    with get_connection() as conn:
        return _filas(conn.cursor().execute(
            "SELECT TOP (?) Id, Fecha, Usuario, Nivel, Mensaje FROM dbo.AppBitacora "
            "WHERE Periodo = ? ORDER BY Fecha DESC, Id DESC",
            limite, periodo,
        ))


# ---------- Programaciones ----------

_COLS_PROG = ("Tipo, Modo, FechaHora, DiaMes, Hora, Activa, ProximaEjecucion, VencimientoOriginal, "
              "UltimaEjecucion, UltimoProcesoId, UltimoResultado, UltimoNivel, CreadoPor, CreadoEn")
_CAMPOS_PROG = {"Activa", "ProximaEjecucion", "VencimientoOriginal", "UltimaEjecucion", "UltimoProcesoId",
                "UltimoResultado", "UltimoNivel"}


def prog_listar() -> list[dict]:
    with get_connection() as conn:
        return _filas(conn.cursor().execute(f"SELECT {_COLS_PROG} FROM dbo.AppProgramaciones"))


def prog_get(tipo: str) -> dict | None:
    with get_connection() as conn:
        return _una(conn.cursor().execute(f"SELECT {_COLS_PROG} FROM dbo.AppProgramaciones WHERE Tipo = ?", tipo))


def prog_guardar(tipo: str, modo: str, fecha_hora: datetime | None, dia_mes: int | None, hora: str | None,
                 proxima: datetime, usuario: str) -> None:
    with get_connection() as conn:
        conn.cursor().execute(
            "MERGE dbo.AppProgramaciones AS t USING (SELECT ? AS Tipo) AS s ON t.Tipo = s.Tipo "
            "WHEN MATCHED THEN UPDATE SET Modo = ?, FechaHora = ?, DiaMes = ?, Hora = ?, Activa = 1, "
            "  ProximaEjecucion = ?, VencimientoOriginal = ?, UltimoResultado = NULL, UltimoNivel = NULL, "
            "  CreadoPor = ?, CreadoEn = ? "
            "WHEN NOT MATCHED THEN INSERT (Tipo, Modo, FechaHora, DiaMes, Hora, Activa, ProximaEjecucion, "
            "  VencimientoOriginal, CreadoPor, CreadoEn) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?);",
            tipo,
            modo, fecha_hora, dia_mes, hora, proxima, proxima, usuario, ahora(),
            tipo, modo, fecha_hora, dia_mes, hora, proxima, proxima, usuario, ahora(),
        )
        conn.commit()


def prog_actualizar(tipo: str, **campos) -> None:
    assert campos and set(campos) <= _CAMPOS_PROG
    sets = ", ".join(f"{k} = ?" for k in campos)
    with get_connection() as conn:
        conn.cursor().execute(f"UPDATE dbo.AppProgramaciones SET {sets} WHERE Tipo = ?", *campos.values(), tipo)
        conn.commit()


def prog_eliminar(tipo: str) -> None:
    with get_connection() as conn:
        conn.cursor().execute("DELETE FROM dbo.AppProgramaciones WHERE Tipo = ?", tipo)
        conn.commit()


def prog_vencidas(momento: datetime) -> list[dict]:
    with get_connection() as conn:
        return _filas(conn.cursor().execute(
            f"SELECT {_COLS_PROG} FROM dbo.AppProgramaciones WHERE Activa = 1 AND ProximaEjecucion <= ?",
            momento,
        ))


# ---------- Histórico por periodo (Dashboard) ----------

def historico_periodos(desde: str) -> list[dict]:
    """Por periodo >= `desde`: filas de Bajas y Cambio de tecnología (última validación válida, con sus filas del
    periodo previo y su estado), de la mora y de la asignación (último proceso OK) y equipos asignados a mano.
    Claves: Periodo, BAJAS, BAJAS_ANTERIOR, BAJAS_ESTADO, CAMBIO_TEC, CAMBIO_TEC_ANTERIOR, CAMBIO_TEC_ESTADO, MORA,
    ASIGNACION, Manuales (las que no tengan dato no vienen)."""
    validaciones = (
        "SELECT Periodo, Insumo, Filas, FilasPeriodoAnterior, Estado FROM ("
        " SELECT Periodo, Insumo, Filas, FilasPeriodoAnterior, Estado,"
        " ROW_NUMBER() OVER (PARTITION BY Periodo, Insumo ORDER BY Fecha DESC, Id DESC) AS rn"
        " FROM dbo.AppValidaciones WHERE Periodo >= ? AND Estado IN ('OK', 'ADVERTENCIA')) t WHERE rn = 1"
    )
    consultas = (
        "SELECT Periodo, Tipo AS Clave, Filas FROM ("
        " SELECT Periodo, Tipo, Filas,"
        " ROW_NUMBER() OVER (PARTITION BY Periodo, Tipo ORDER BY Inicio DESC, Id DESC) AS rn"
        " FROM dbo.AppProcesos WHERE Periodo >= ? AND Tipo IN ('MORA', 'ASIGNACION') AND Estado = 'OK') t WHERE rn = 1",
        "SELECT Periodo, 'Manuales' AS Clave, COUNT(DISTINCT EquipoId) AS Filas"
        " FROM dbo.AppAsignacionesManuales WHERE Periodo >= ? GROUP BY Periodo",
    )
    datos: dict[str, dict] = {}
    with get_connection() as conn:
        cur = conn.cursor()
        for periodo, insumo, filas, anterior, estado in cur.execute(validaciones, desde).fetchall():
            insumo = insumo.strip()
            datos.setdefault(periodo.strip(), {}).update(
                {insumo: filas, f"{insumo}_ANTERIOR": anterior, f"{insumo}_ESTADO": estado.strip()})
        for sql in consultas:
            for periodo, clave, filas in cur.execute(sql, desde).fetchall():
                datos.setdefault(periodo.strip(), {})[clave.strip()] = filas
    return [{"Periodo": p, **v} for p, v in sorted(datos.items())]


# ---------- Objetos de negocio ----------

def contar_periodos(tabla: str, columna: str, periodos: list[str]) -> dict[str, int]:
    marcas = ", ".join("?" for _ in periodos)
    with get_connection() as conn:
        rows = conn.cursor().execute(
            f"SELECT {columna}, COUNT(*) FROM {tabla} WHERE {columna} IN ({marcas}) GROUP BY {columna}",
            *periodos,
        ).fetchall()
    return {str(r[0]).strip(): r[1] for r in rows}


def max_periodo(tabla: str, columna: str) -> str | None:
    with get_connection() as conn:
        v = conn.cursor().execute(f"SELECT MAX({columna}) FROM {tabla}").fetchval()
    return None if v is None else str(v).strip()


def contar_filas(tabla: str) -> int:
    with get_connection() as conn:
        return conn.cursor().execute(f"SELECT COUNT_BIG(*) FROM {tabla}").fetchval()


def ejecutar_sp(nombre: str, param: str, valor: str | None, timeout: int, on_spid) -> int | None:
    """Ejecuta un SP y devuelve la suma de filas afectadas reportadas (None si el SP usa NOCOUNT)."""
    with get_connection(timeout=timeout) as conn:
        cur = conn.cursor()
        on_spid(cur.execute("SELECT @@SPID").fetchval())
        if param:
            cur.execute(f"EXEC {nombre} {param} = ?", valor)
        else:
            cur.execute(f"EXEC {nombre}")
        # Consumir todos los resultados para que el SP termine
        filas = None
        while True:
            if cur.rowcount is not None and cur.rowcount >= 0:
                filas = (filas or 0) + cur.rowcount
            if not cur.nextset():
                break
        conn.commit()
    return filas


# ---------- Equipos sin agencia (toda la tabla de asignación) ----------

def _sin_agencia() -> str:
    return f"{settings.ASIGNACION_COLUMNA_AGENCIA} IS NULL"


def sin_asignar_contar() -> int:
    with get_connection() as conn:
        return conn.cursor().execute(
            f"SELECT COUNT_BIG(*) FROM {settings.ASIGNACION_TABLA} WHERE {_sin_agencia()}"
        ).fetchval()


def sin_asignar_listar(limite: int) -> tuple[list[str], list[dict]]:
    """Devuelve (columnas visibles, filas). Cada fila trae además `_id` con el identificador del equipo."""
    visibles = settings.ASIGNACION_COLUMNAS_VISIBLES.split(",")
    with get_connection() as conn:
        cur = conn.cursor().execute(
            f"SELECT TOP ({int(limite)}) {settings.ASIGNACION_COLUMNA_ID} AS _id, {', '.join(visibles)} "
            f"FROM {settings.ASIGNACION_TABLA} WHERE {_sin_agencia()} ORDER BY {settings.ASIGNACION_COLUMNA_ID}"
        )
        filas = _filas(cur)
    return [c.strip("[]") for c in visibles], filas


def agencias_listar() -> list[dict]:
    with get_connection() as conn:
        cur = conn.cursor().execute(
            f"SELECT {settings.AGENCIAS_COLUMNA_VALOR} AS valor, {settings.AGENCIAS_COLUMNA_NOMBRE} AS nombre "
            f"FROM {settings.AGENCIAS_TABLA} ORDER BY {settings.AGENCIAS_COLUMNA_NOMBRE}"
        )
        return [{"valor": str(r["valor"]).strip(), "nombre": str(r["nombre"]).strip()} for r in _filas(cur)]


def asignar_agencia(ids: list[str], agencia: str, periodo: str, usuario: str) -> int:
    """Asigna la agencia a los equipos indicados y deja el cambio en AppAsignacionesManuales.

    Solo se tocan equipos sin agencia o que ya se asignaron a mano en este periodo (para corregirlos); lo que puso el
    SP no se pisa. Devuelve cuántos cambiaron.
    """
    col_id, col_ag = settings.ASIGNACION_COLUMNA_ID, settings.ASIGNACION_COLUMNA_AGENCIA
    total = 0
    with get_connection() as conn:
        cur = conn.cursor()
        for i in range(0, len(ids), 500):  # SQL Server admite ~2100 parámetros por consulta
            bloque = ids[i:i + 500]
            marcas = ", ".join("?" for _ in bloque)
            cur.execute(
                f"SELECT {col_id} AS id, {col_ag} AS agencia FROM {settings.ASIGNACION_TABLA} WITH (UPDLOCK) "
                f"WHERE {col_id} IN ({marcas}) AND ({col_ag} IS NULL OR ({col_ag} <> ? AND {col_id} IN "
                f"(SELECT EquipoId FROM dbo.AppAsignacionesManuales WHERE Periodo = ?)))",
                *bloque, agencia, periodo,
            )
            cambios = [(str(f.id).strip(), None if f.agencia is None else str(f.agencia).strip()) for f in cur.fetchall()]
            if not cambios:
                continue
            marcas = ", ".join("?" for _ in cambios)
            cur.execute(
                f"UPDATE {settings.ASIGNACION_TABLA} SET {col_ag} = ? WHERE {col_id} IN ({marcas})",
                agencia, *[c[0] for c in cambios],
            )
            total += cur.rowcount
            cur.executemany(
                "INSERT INTO dbo.AppAsignacionesManuales (Periodo, EquipoId, AgenciaAnterior, AgenciaNueva, Usuario, Fecha) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                [(periodo, eq, anterior, agencia, usuario, ahora()) for eq, anterior in cambios],
            )
        conn.commit()
    return total


def equipo_editar(id_: str, valores: dict[str, str | None]) -> dict | None:
    """Corrige columnas editables de un equipo sin agencia. `valores` va por nombre visible (sin corchetes).

    Devuelve los valores anteriores, o None si el equipo no existe o ya tiene agencia."""
    reales = {c.strip("[]"): c for c in settings.ASIGNACION_COLUMNAS_EDITABLES.split(",") if c}
    cols = [reales[k] for k in valores]  # el router ya validó que sean editables
    col_id = settings.ASIGNACION_COLUMNA_ID
    with get_connection() as conn:
        cur = conn.cursor()
        antes = _una(cur.execute(
            f"SELECT {', '.join(cols)} FROM {settings.ASIGNACION_TABLA} WITH (UPDLOCK) "
            f"WHERE {col_id} = ? AND {_sin_agencia()}", id_))
        if not antes:
            return None
        cur.execute(
            f"UPDATE {settings.ASIGNACION_TABLA} SET {', '.join(f'{c} = ?' for c in cols)} "
            f"WHERE {col_id} = ? AND {_sin_agencia()}", *valores.values(), id_)
        conn.commit()
    return {k.strip("[]"): v for k, v in antes.items()}


def asignados_manual_listar(periodo: str, limite: int) -> tuple[list[str], list[dict]]:
    """Equipos asignados a mano en el periodo. Cada fila trae `_id` y `_agencia` (valor actual de la tabla)."""
    visibles = settings.ASIGNACION_COLUMNAS_VISIBLES.split(",")
    with get_connection() as conn:
        cur = conn.cursor().execute(
            f"SELECT TOP ({int(limite)}) {settings.ASIGNACION_COLUMNA_ID} AS _id, "
            f"{settings.ASIGNACION_COLUMNA_AGENCIA} AS _agencia, {', '.join(visibles)} "
            f"FROM {settings.ASIGNACION_TABLA} WHERE {settings.ASIGNACION_COLUMNA_ID} IN "
            f"(SELECT EquipoId FROM dbo.AppAsignacionesManuales WHERE Periodo = ?) "
            f"ORDER BY {settings.ASIGNACION_COLUMNA_ID}", periodo,
        )
        filas = _filas(cur)
    return [c.strip("[]") for c in visibles], filas


def asignaciones_reaplicar(periodo: str) -> tuple[int, int]:
    """Tras regenerar: reaplica la última agencia manual de cada equipo que el SP dejó sin agencia.

    Devuelve (reaplicadas, equipos con asignación manual en el periodo).
    """
    ultimas = (
        "WITH ult AS (SELECT EquipoId, AgenciaNueva, ROW_NUMBER() OVER (PARTITION BY EquipoId ORDER BY Id DESC) AS rn "
        "FROM dbo.AppAsignacionesManuales WHERE Periodo = ?) "
    )
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            ultimas + f"UPDATE a SET a.{settings.ASIGNACION_COLUMNA_AGENCIA} = u.AgenciaNueva "
            f"FROM {settings.ASIGNACION_TABLA} a JOIN ult u ON a.{settings.ASIGNACION_COLUMNA_ID} = u.EquipoId AND u.rn = 1 "
            f"WHERE a.{settings.ASIGNACION_COLUMNA_AGENCIA} IS NULL", periodo,
        )
        reaplicadas = cur.rowcount
        total = cur.execute(
            "SELECT COUNT(DISTINCT EquipoId) FROM dbo.AppAsignacionesManuales WHERE Periodo = ?", periodo).fetchval()
        conn.commit()
    return reaplicadas, total


def asignacion_exportar(on_columnas, on_filas) -> int:
    """Recorre toda la tabla de asignación en bloques: on_columnas(nombres) y luego on_filas(lista) por bloque."""
    total = 0
    with get_connection() as conn:
        cur = conn.cursor().execute(f"SELECT * FROM {settings.ASIGNACION_TABLA}")
        on_columnas([c[0] for c in cur.description])
        while filas := cur.fetchmany(5000):
            on_filas(filas)
            total += len(filas)
    return total


# ---------- Cierre del periodo ----------

def cierre_get(periodo: str) -> dict | None:
    with get_connection() as conn:
        return _una(conn.cursor().execute(
            "SELECT Periodo, Usuario, Fecha FROM dbo.AppCierres WHERE Periodo = ?", periodo))


def cierre_crear(periodo: str, usuario: str) -> None:
    with get_connection() as conn:
        conn.cursor().execute(
            "INSERT INTO dbo.AppCierres (Periodo, Usuario, Fecha) VALUES (?, ?, ?)", periodo, usuario, ahora())
        conn.commit()


def cierre_eliminar(periodo: str) -> None:
    with get_connection() as conn:
        conn.cursor().execute("DELETE FROM dbo.AppCierres WHERE Periodo = ?", periodo)
        conn.commit()


# ---------- Usuarios ----------

def usuario_hash(username: str) -> str | None:
    with get_connection() as conn:
        row = conn.cursor().execute(
            "SELECT PasswordHash FROM dbo.AppUsuarios WHERE Username = ? AND Activo = 1", username
        ).fetchone()
    return row[0] if row else None


# Modo demo: sin SQL Server, las funciones públicas se reemplazan por las de repo_demo (en memoria)
if settings.DEMO_MODE:
    from .repo_demo import *  # noqa: F401,F403,E402
