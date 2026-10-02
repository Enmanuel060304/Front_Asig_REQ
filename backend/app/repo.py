"""Acceso a SQL Server: tablas de la app (procesos, validaciones, bitácora, programaciones)
y operaciones sobre los objetos de negocio (SPs e insumos)."""
from datetime import datetime

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
