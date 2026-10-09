import os
import re
from pathlib import Path
from zoneinfo import ZoneInfo

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
    # Subconjunto de las visibles que el usuario puede corregir en el paso 3 (vacío = ninguna)
    ASIGNACION_COLUMNAS_EDITABLES: str = ""
    # Filtro de los equipos que aplican dentro de la staging (vacío = toda la tabla)
    ASIGNACION_COLUMNA_APLICA: str = ""
    ASIGNACION_VALOR_APLICA: str = ""
    # Tabla final que llena el SP de completar; de ella sale el Excel (vacío = se exporta ASIGNACION_TABLA)
    ASIGNACION_RETIRO_TABLA: str = ""
    ASIGNACION_RETIRO_COLUMNA_PERIODO: str = ""  # vacío = se exporta la tabla completa

    # Completar (paso 4): SP que pasa a la tabla final los equipos que aplican (vacío = solo se cierra en la app)
    SP_COMPLETAR: str = ""
    SP_COMPLETAR_PARAM_PERIODO: str = ""
    COMPLETAR_TIMEOUT_SECONDS: int = 0

    # Catálogo de agencias
    AGENCIAS_TABLA: str
    AGENCIAS_COLUMNA_VALOR: str  # lo que se escribe en la asignación
    AGENCIAS_COLUMNA_NOMBRE: str  # lo que ve el usuario

    # Programación
    APP_TIMEZONE: str = "America/Guatemala"
    PROGRAMACION_TOLERANCIA_MIN: int = 120

    # Seguridad
    JWT_SECRET: str
    JWT_EXPIRE_MINUTES: int = 480
    COOKIE_SECURE: bool = False

    # App
    DEMO_MODE: bool = False  # True = repo en memoria con datos ficticios, sin SQL Server
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    @field_validator("BAJAS_TABLA", "CAMBIO_TEC_TABLA", "MORA_TABLA",
                     "SP_EXTRAER_BAJAS", "SP_EXTRAER_CAMBIO_TEC", "SP_MORA", "SP_ASIGNACION",
                     "ASIGNACION_TABLA", "AGENCIAS_TABLA")
    @classmethod
    def validar_objeto(cls, v: str, info) -> str:
        if not re.fullmatch(_OBJETO_SQL, v):
            raise ValueError(f"{info.field_name} no es un nombre SQL válido")
        return v

    @field_validator("SP_COMPLETAR", "ASIGNACION_RETIRO_TABLA")
    @classmethod
    def validar_objeto_opcional(cls, v: str, info) -> str:
        if v and not re.fullmatch(_OBJETO_SQL, v):
            raise ValueError(f"{info.field_name} no es un nombre SQL válido")
        return v

    @field_validator("ASIGNACION_COLUMNA_APLICA", "ASIGNACION_RETIRO_COLUMNA_PERIODO")
    @classmethod
    def validar_columna_opcional(cls, v: str, info) -> str:
        if v and not re.fullmatch(_COLUMNA_SQL, v):
            raise ValueError(f"{info.field_name} no es un nombre de columna válido")
        return v

    @field_validator("ASIGNACION_VALOR_APLICA")
    @classmethod
    def validar_valor_aplica(cls, v: str, info) -> str:
        if not re.fullmatch(r"[\w .-]*", v):
            raise ValueError(f"{info.field_name} solo admite letras, números, espacios, punto y guion")
        return v

    @field_validator("BAJAS_COLUMNA_PERIODO", "CAMBIO_TEC_COLUMNA_PERIODO", "ASIGNACION_COLUMNA_ID",
                     "ASIGNACION_COLUMNA_AGENCIA", "AGENCIAS_COLUMNA_VALOR", "AGENCIAS_COLUMNA_NOMBRE")
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

    @model_validator(mode="after")
    def validar_editables(self):
        editables = [c.strip() for c in self.ASIGNACION_COLUMNAS_EDITABLES.split(",") if c.strip()]
        visibles = self.ASIGNACION_COLUMNAS_VISIBLES.split(",")
        prohibidas = {self.ASIGNACION_COLUMNA_ID, self.ASIGNACION_COLUMNA_AGENCIA}
        if any(c not in visibles or c in prohibidas for c in editables):
            raise ValueError("ASIGNACION_COLUMNAS_EDITABLES debe ser un subconjunto de ASIGNACION_COLUMNAS_VISIBLES "
                             "sin la columna identificadora ni la de agencia")
        self.ASIGNACION_COLUMNAS_EDITABLES = ",".join(editables)
        if bool(self.ASIGNACION_COLUMNA_APLICA) != bool(self.ASIGNACION_VALOR_APLICA):
            raise ValueError("ASIGNACION_COLUMNA_APLICA y ASIGNACION_VALOR_APLICA van juntas (las dos o ninguna)")
        return self

    @field_validator("SP_EXTRAER_BAJAS_PARAM_PERIODO", "SP_EXTRAER_CAMBIO_TEC_PARAM_PERIODO", "SP_COMPLETAR_PARAM_PERIODO")
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
