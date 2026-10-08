-- Historial de agencias asignadas a mano (paso 3). Una fila por cambio; la vigente de cada equipo es la más reciente
-- (Id mayor) de su periodo. Al regenerar la asignación se reaplican sobre los equipos que el SP deja sin agencia.
-- Fechas en hora local de la app (APP_TIMEZONE).

IF OBJECT_ID('dbo.AppAsignacionesManuales', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AppAsignacionesManuales (
        Id              INT IDENTITY(1,1) PRIMARY KEY,
        Periodo         CHAR(6)       NOT NULL,   -- YYYYMM de la asignación
        EquipoId        NVARCHAR(100) NOT NULL,   -- valor de ASIGNACION_COLUMNA_ID
        AgenciaAnterior NVARCHAR(100) NULL,       -- NULL = estaba sin agencia
        AgenciaNueva    NVARCHAR(100) NOT NULL,
        Usuario         NVARCHAR(150) NOT NULL,
        Fecha           DATETIME2(0)  NOT NULL
    );
    CREATE INDEX IX_AppAsignacionesManuales_Periodo ON dbo.AppAsignacionesManuales (Periodo, EquipoId);
END
GO
