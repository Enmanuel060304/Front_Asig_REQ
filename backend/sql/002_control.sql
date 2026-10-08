-- Control de la asignación: procesos, validaciones de insumos, bitácora y programaciones.
-- Las fechas se guardan en hora local de la app (APP_TIMEZONE).

-- Ejecuciones de SPs: extracciones de insumos, mora y asignación
IF OBJECT_ID('dbo.AppProcesos', 'U') IS NULL
CREATE TABLE dbo.AppProcesos (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    Periodo    CHAR(6)        NOT NULL,             -- YYYYMM de la asignación
    Tipo       VARCHAR(30)    NOT NULL,             -- EXTRAER_BAJAS | EXTRAER_CAMBIO_TEC | MORA | ASIGNACION
    Origen     VARCHAR(20)    NOT NULL,             -- MANUAL | PROGRAMADO
    Estado     VARCHAR(20)    NOT NULL,             -- EN_PROCESO | OK | ERROR
    Usuario    NVARCHAR(150)  NOT NULL,
    Inicio     DATETIME2(0)   NOT NULL,
    Fin        DATETIME2(0)   NULL,
    DuracionMs INT            NULL,
    Filas      BIGINT         NULL,
    Spid       INT            NULL,                 -- sesión SQL, para el detalle en vivo
    Error      NVARCHAR(4000) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AppProcesos_Periodo_Tipo')
CREATE INDEX IX_AppProcesos_Periodo_Tipo ON dbo.AppProcesos (Periodo, Tipo, Inicio DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AppProcesos_Inicio')
CREATE INDEX IX_AppProcesos_Inicio ON dbo.AppProcesos (Inicio DESC);
GO

-- Resultado de cada validación de insumo
IF OBJECT_ID('dbo.AppValidaciones', 'U') IS NULL
CREATE TABLE dbo.AppValidaciones (
    Id                   INT IDENTITY(1,1) PRIMARY KEY,
    Periodo              CHAR(6)        NOT NULL,
    Insumo               VARCHAR(30)    NOT NULL,   -- BAJAS | CAMBIO_TEC
    Estado               VARCHAR(20)    NOT NULL,   -- OK | ADVERTENCIA | ERROR
    PeriodoEncontrado    VARCHAR(20)    NULL,
    Filas                BIGINT         NULL,
    FilasPeriodoAnterior BIGINT         NULL,
    Usuario              NVARCHAR(150)  NOT NULL,
    Fecha                DATETIME2(0)   NOT NULL,
    Detalle              NVARCHAR(500)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AppValidaciones_Periodo_Insumo')
CREATE INDEX IX_AppValidaciones_Periodo_Insumo ON dbo.AppValidaciones (Periodo, Insumo, Fecha DESC);
GO

-- Bitácora de eventos del periodo
IF OBJECT_ID('dbo.AppBitacora', 'U') IS NULL
CREATE TABLE dbo.AppBitacora (
    Id      INT IDENTITY(1,1) PRIMARY KEY,
    Periodo CHAR(6)        NOT NULL,
    Fecha   DATETIME2(0)   NOT NULL,
    Usuario NVARCHAR(150)  NOT NULL,
    Nivel   VARCHAR(10)    NOT NULL,                -- info | ok | warn | error
    Mensaje NVARCHAR(1000) NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AppBitacora_Periodo')
CREATE INDEX IX_AppBitacora_Periodo ON dbo.AppBitacora (Periodo, Fecha DESC);
GO

-- Programaciones (una por tipo de proceso)
IF OBJECT_ID('dbo.AppProgramaciones', 'U') IS NULL
CREATE TABLE dbo.AppProgramaciones (
    Tipo                VARCHAR(30)   NOT NULL PRIMARY KEY,  -- MORA | EXTRAER_BAJAS | EXTRAER_CAMBIO_TEC | INSUMOS (flujo: extraer + generar)
    Modo                VARCHAR(10)   NOT NULL,              -- UNICA | MENSUAL
    FechaHora           DATETIME2(0)  NULL,                  -- UNICA
    DiaMes              TINYINT       NULL,                  -- MENSUAL (si el mes es más corto, último día)
    Hora                CHAR(5)       NULL,                  -- MENSUAL, HH:MM
    Activa              BIT           NOT NULL DEFAULT 1,
    ProximaEjecucion    DATETIME2(0)  NULL,
    VencimientoOriginal DATETIME2(0)  NULL,                  -- para la tolerancia cuando se reintenta
    UltimaEjecucion     DATETIME2(0)  NULL,
    UltimoProcesoId     INT           NULL,
    UltimoResultado     NVARCHAR(300) NULL,                  -- qué pasó en el último disparo (ejecutada, omitida, en espera...)
    UltimoNivel         VARCHAR(10)   NULL,                  -- info | ok | warn | error
    CreadoPor           NVARCHAR(150) NOT NULL,
    CreadoEn            DATETIME2(0)  NOT NULL
);
GO

-- Columnas agregadas después de la primera versión del script
IF COL_LENGTH('dbo.AppProgramaciones', 'UltimoResultado') IS NULL
    ALTER TABLE dbo.AppProgramaciones ADD UltimoResultado NVARCHAR(300) NULL, UltimoNivel VARCHAR(10) NULL;
GO
