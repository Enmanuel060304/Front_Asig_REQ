-- Usuarios de la aplicación Asignación REQ
IF OBJECT_ID('dbo.AppUsuarios', 'U') IS NULL
CREATE TABLE dbo.AppUsuarios (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Username     NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(200) NOT NULL,
    Activo       BIT NOT NULL DEFAULT 1,
    CreadoEn     DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
