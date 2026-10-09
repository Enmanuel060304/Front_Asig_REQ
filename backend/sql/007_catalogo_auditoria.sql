-- Rastro de cada alta/edición/baja del catálogo de agencias (el DELETE es físico: aquí queda lo que había).
-- Fechas en hora local de la app (APP_TIMEZONE). Va también a producción.

IF OBJECT_ID('dbo.AppCatalogoAuditoria', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AppCatalogoAuditoria (
        Id        INT IDENTITY(1,1) PRIMARY KEY,
        Tabla     NVARCHAR(20)   NOT NULL,   -- DISTRITO | MUNICIPIO | AGENCIA
        Operacion NVARCHAR(10)   NOT NULL,   -- ALTA | CAMBIO | BAJA
        Clave     NVARCHAR(150)  NOT NULL,   -- distrito, id de municipio o nombre de la agencia
        Antes     NVARCHAR(500)  NULL,       -- JSON con la fila previa (NULL en ALTA)
        Despues   NVARCHAR(500)  NULL,       -- JSON con la fila nueva (NULL en BAJA)
        Usuario   NVARCHAR(150)  NOT NULL,
        Fecha     DATETIME2(0)   NOT NULL
    );
    CREATE INDEX IX_AppCatalogoAuditoria_Fecha ON dbo.AppCatalogoAuditoria (Fecha DESC);
END
GO
