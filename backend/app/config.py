import os
import re
from pathlib import Path
from zoneinfo import ZoneInfo

from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

# Nombre SQL de 1 a 4 partes: tabla, dbo.tabla, [srv].[db].[dbo].[tabla]
_OBJETO_SQL = r"(\[[^\]\[]+\]|\w+)(\.(\[[^\]\[]+\]|\w+)){0,3}"
_COLUMNA_SQL = r"\[[^\]\[]+\]|\w+"
_PARAM_SQL = r"(@\w+)?"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / os.getenv("ENV_FILE", ".env"), env_file_encoding="utf-8")

    # SQL Server
    DB_SERVER: str
    DB_PORT: int | None = None  # vacío si se usa instancia con nombre (servidor\instancia)
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str
    DB_DRIVER: str = "ODBC Driver 18 for SQL Server"
    DB_ENCRYPT: str = "yes"
    DB_TRUST_SERVER_CERTIFICATE: str = "yes"
    # Cadena ODBC completa; si viene, reemplaza a las variables DB_* de arriba (p. ej. autenticación integrada)
    DB_CONNECTION_STRING: str = ""

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
    # Tabla resultado de la asignación (equipos sin agencia y exportación a Excel)
    ASIGNACION_TABLA: str
    ASIGNACION_COLUMNA_ID: str
    ASIGNACION_COLUMNA_AGENCIA: str
    ASIGNACION_COLUMNAS_VISIBLES: str  # separadas por comas

    # Catálogo de agencias
    AGENCIAS_TABLA: str
    AGENCIAS_COLUMNA_VALOR: str  # lo que se escribe en la asignación
    AGENCIAS_COLUMNA_NOMBRE: str  # lo que ve el usuario

    # Mantenimiento del catálogo (mapeos distrito/municipio → agencia)
    CATALOGO_DISTRITO_TABLA: str = "Cat.Cat_Asig_Distrito"
    CATALOGO_DISTRITO_COLUMNA: str = "DISTRITO"
    CATALOGO_MUNICIPIO_TABLA: str = "Cat.Cat_Asig_Municipio"
    CATALOGO_MUNICIPIO_COLUMNA_ID: str = "ID"
    CATALOGO_MUNICIPIO_COLUMNA: str = "MUNICIPIO"
    CATALOGO_COLUMNA_AGENCIA: str = "AGENCIA"

    # Programación
    APP_TIMEZONE: str = "America/Managua"
    PROGRAMACION_TOLERANCIA_MIN: int = 120

    # Seguridad
    JWT_SECRET: str
    JWT_EXPIRE_MINUTES: int = 480
    COOKIE_SECURE: bool = False

    # App
    APP_ENV: Literal["development", "production"] = "development"
    DEMO_MODE: bool = False  # True = repo en memoria con datos ficticios, sin SQL Server
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    @field_validator("BAJAS_TABLA", "CAMBIO_TEC_TABLA", "MORA_TABLA",
                     "SP_EXTRAER_BAJAS", "SP_EXTRAER_CAMBIO_TEC", "SP_MORA", "SP_ASIGNACION",
                     "ASIGNACION_TABLA", "AGENCIAS_TABLA", "CATALOGO_DISTRITO_TABLA", "CATALOGO_MUNICIPIO_TABLA")
    @classmethod
    def validar_objeto(cls, v: str, info) -> str:
        if not re.fullmatch(_OBJETO_SQL, v):
            raise ValueError(f"{info.field_name} no es un nombre SQL válido")
        return v

    @field_validator("BAJAS_COLUMNA_PERIODO", "CAMBIO_TEC_COLUMNA_PERIODO", "ASIGNACION_COLUMNA_ID",
                     "ASIGNACION_COLUMNA_AGENCIA", "AGENCIAS_COLUMNA_VALOR", "AGENCIAS_COLUMNA_NOMBRE",
                     "CATALOGO_DISTRITO_COLUMNA", "CATALOGO_MUNICIPIO_COLUMNA_ID", "CATALOGO_MUNICIPIO_COLUMNA",
                     "CATALOGO_COLUMNA_AGENCIA")
    @classmethod
    def validar_columna(cls, v: str, info) -> str:
        if not re.fullmatch(_COLUMNA_SQL, v):
            raise ValueError(f"{info.field_name} no es un nombre de columna válido")
        return v

    @field_validator("ASIGNACION_COLUMNAS_VISIBLES")
    @classmethod
    def validar_columnas(cls, v: str, info) -> str:
        cols = [c.strip() for c in v.split(",") if c.strip()]
        if not cols or not all(re.fullmatch(_COLUMNA_SQL, c) for c in cols):
            raise ValueError(f"{info.field_name} debe ser una lista de columnas separadas por comas")
        return ",".join(cols)

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

    @model_validator(mode="after")
    def validar_produccion(self):
        """Un .env de pruebas copiado por error a producción debe fallar al arrancar, no en silencio."""
        if self.APP_ENV == "production":
            problemas = []
            if self.DEMO_MODE:
                problemas.append("DEMO_MODE debe ser false")
            if not self.COOKIE_SECURE:
                problemas.append("COOKIE_SECURE debe ser true (HTTPS)")
            if len(self.JWT_SECRET) < 32 or self.JWT_SECRET.startswith("cambia-esto"):
                problemas.append("JWT_SECRET debe ser un secreto aleatorio de al menos 32 caracteres")
            if problemas:
                raise ValueError("APP_ENV=production no es seguro: " + "; ".join(problemas))
        return self


settings = Settings()
