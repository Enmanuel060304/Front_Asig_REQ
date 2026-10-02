import re
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

# Nombre SQL de 1 a 4 partes: tabla, dbo.tabla, [srv].[db].[dbo].[tabla]
_OBJETO_SQL = r"(\[[^\]\[]+\]|\w+)(\.(\[[^\]\[]+\]|\w+)){0,3}"
_COLUMNA_SQL = r"\[[^\]\[]+\]|\w+"
_PARAM_SQL = r"(@\w+)?"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8")

    # SQL Server
    DB_SERVER: str
    DB_PORT: int | None = None  # vacío si se usa instancia con nombre (servidor\instancia)
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str
    DB_DRIVER: str = "ODBC Driver 18 for SQL Server"
    DB_ENCRYPT: str = "yes"
    DB_TRUST_SERVER_CERTIFICATE: str = "yes"

    # Insumo: Bajas
    BAJAS_TABLA: str
    BAJAS_COLUMNA_PERIODO: str
    SP_EXTRAER_BAJAS: str
    SP_EXTRAER_BAJAS_PARAM_PERIODO: str = ""

    # Insumo: Cambio de tecnología
    CAMBIO_TEC_TABLA: str
    CAMBIO_TEC_COLUMNA_PERIODO: str
    SP_EXTRAER_CAMBIO_TEC: str
    SP_EXTRAER_CAMBIO_TEC_PARAM_PERIODO: str = ""

    EXTRACCION_TIMEOUT_SECONDS: int = 0  # 0 = sin límite
    VARIACION_ALERTA_PCT: float = 30

    # Mora
    SP_MORA: str
    MORA_TABLA: str
    MORA_TIMEOUT_SECONDS: int = 0

    # Asignación
    SP_ASIGNACION: str
    ASIGNACION_TIMEOUT_SECONDS: int = 0

    # Programación
    APP_TIMEZONE: str = "America/Guatemala"
    PROGRAMACION_TOLERANCIA_MIN: int = 120

    # Seguridad
    JWT_SECRET: str
    JWT_EXPIRE_MINUTES: int = 480
    COOKIE_SECURE: bool = False

    # App
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    @field_validator("BAJAS_TABLA", "CAMBIO_TEC_TABLA", "MORA_TABLA",
                     "SP_EXTRAER_BAJAS", "SP_EXTRAER_CAMBIO_TEC", "SP_MORA", "SP_ASIGNACION")
    @classmethod
    def validar_objeto(cls, v: str, info) -> str:
        if not re.fullmatch(_OBJETO_SQL, v):
            raise ValueError(f"{info.field_name} no es un nombre SQL válido")
        return v

    @field_validator("BAJAS_COLUMNA_PERIODO", "CAMBIO_TEC_COLUMNA_PERIODO")
    @classmethod
    def validar_columna(cls, v: str, info) -> str:
        if not re.fullmatch(_COLUMNA_SQL, v):
            raise ValueError(f"{info.field_name} no es un nombre de columna válido")
        return v

    @field_validator("SP_EXTRAER_BAJAS_PARAM_PERIODO", "SP_EXTRAER_CAMBIO_TEC_PARAM_PERIODO")
    @classmethod
    def validar_param(cls, v: str, info) -> str:
        if not re.fullmatch(_PARAM_SQL, v):
            raise ValueError(f"{info.field_name} debe estar vacío o ser un parámetro como @Periodo")
        return v

    @field_validator("APP_TIMEZONE")
    @classmethod
    def validar_tz(cls, v: str) -> str:
        ZoneInfo(v)
        return v

    @field_validator("DB_PORT", mode="before")
    @classmethod
    def puerto_vacio(cls, v):
        return None if v == "" else v


settings = Settings()
