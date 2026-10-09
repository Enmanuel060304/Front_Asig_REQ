from contextlib import contextmanager

import pyodbc

from .config import settings


def _connection_string() -> str:
    if settings.DB_CONNECTION_STRING:
        return settings.DB_CONNECTION_STRING
    server = settings.DB_SERVER if settings.DB_PORT is None else f"{settings.DB_SERVER},{settings.DB_PORT}"
    return (
        f"DRIVER={{{settings.DB_DRIVER}}};"
        f"SERVER={server};"
        f"DATABASE={settings.DB_NAME};"
        f"UID={settings.DB_USER};"
        f"PWD={{{settings.DB_PASSWORD}}};"
        f"Encrypt={settings.DB_ENCRYPT};"
        f"TrustServerCertificate={settings.DB_TRUST_SERVER_CERTIFICATE};"
    )


@contextmanager
def get_connection(timeout: int = 0):
    conn = pyodbc.connect(_connection_string(), autocommit=False)
    conn.timeout = timeout
    try:
        yield conn
    finally:
        conn.close()
