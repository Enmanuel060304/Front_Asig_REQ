-- Cierre del periodo: una fila = la asignación de ese periodo está completada (lista para exportar).
-- Reabrir borra la fila; el historial queda en AppBitacora. Fechas en hora local de la app (APP_TIMEZONE).

IF OBJECT_ID('dbo.AppCierres', 'U') IS NULL
CREATE TABLE dbo.AppCierres (
    Periodo CHAR(6)       NOT NULL PRIMARY KEY,  -- YYYYMM de la asignación
    Usuario NVARCHAR(150) NOT NULL,
    Fecha   DATETIME2(0)  NOT NULL
);
GO
