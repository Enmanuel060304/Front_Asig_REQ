-- =====================================================================================================
-- SOLO DESARROLLO / DEMO. NUNCA EJECUTAR EN PRODUCCIÓN: inserta datos ficticios en el catálogo Cat.*
-- Idempotente: cada fila se inserta solo si no existe, se puede correr varias veces.
--
-- Antes de correr: pon abajo el nombre de TU base de pruebas. Si la base activa es otra, el script se detiene
-- sin tocar nada (protección contra ejecutarlo por error en la base oficial).
-- =====================================================================================================
DECLARE @BD_PRUEBAS sysname = N'NombreBaseDatos';   -- <-- CAMBIAR por el nombre de la base de pruebas

IF DB_NAME() <> @BD_PRUEBAS
BEGIN
    DECLARE @actual sysname = DB_NAME();
    RAISERROR('La base activa es "%s" y no la de pruebas "%s". No se insertó nada.', 16, 1, @actual, @BD_PRUEBAS);
    SET NOEXEC ON;   -- el resto del script no se ejecuta
END
GO

SET NOCOUNT ON;

-- ---------- Cat_Asig_Distrito (DISTRITO, AGENCIA) ----------
DECLARE @distritos TABLE (DISTRITO NVARCHAR(100), AGENCIA NVARCHAR(100));
INSERT INTO @distritos VALUES
 (N'Managua - Distrito I',   N'Agencia Managua Norte'),
 (N'Managua - Distrito II',  N'Agencia Managua Norte'),
 (N'Managua - Distrito III', N'Agencia Managua Centro'),
 (N'Managua - Distrito IV',  N'Agencia Managua Centro'),
 (N'Managua - Distrito V',   N'Agencia Managua Sur'),
 (N'Managua - Distrito VI',  N'Agencia Managua Sur'),
 (N'Managua - Distrito VII', N'Agencia Managua Oriente'),
 (N'León - Casco urbano',    N'Agencia León'),
 (N'León - Sutiaba',         N'Agencia León'),
 (N'Masaya - Centro',        N'Agencia Masaya'),
 (N'Granada - Centro',       N'Agencia Granada'),
 (N'Chinandega - Centro',    N'Agencia Chinandega'),
 (N'Estelí - Centro',        N'Agencia Estelí'),
 (N'Matagalpa - Centro',     N'Agencia Matagalpa');

INSERT INTO Cat.Cat_Asig_Distrito (DISTRITO, AGENCIA)
SELECT d.DISTRITO, d.AGENCIA
FROM @distritos d
WHERE NOT EXISTS (SELECT 1 FROM Cat.Cat_Asig_Distrito x WHERE x.DISTRITO = d.DISTRITO);
PRINT CONCAT('Distritos insertados: ', @@ROWCOUNT);

-- ---------- Cat_Asig_Municipio (ID, MUNICIPIO, AGENCIA) ----------
DECLARE @municipios TABLE (MUNICIPIO NVARCHAR(100), AGENCIA NVARCHAR(100));
INSERT INTO @municipios VALUES
 (N'Tipitapa',        N'Agencia Managua Oriente'),
 (N'Ciudad Sandino',  N'Agencia Managua Norte'),
 (N'Mateare',         N'Agencia Managua Norte'),
 (N'Villa El Carmen', N'Agencia Managua Sur'),
 (N'San Marcos',      N'Agencia Managua Sur'),
 (N'Ticuantepe',      N'Agencia Managua Sur'),
 (N'Masaya',          N'Agencia Masaya'),
 (N'Nindirí',         N'Agencia Masaya'),
 (N'Catarina',        N'Agencia Masaya'),
 (N'Granada',         N'Agencia Granada'),
 (N'Diriá',           N'Agencia Granada'),
 (N'Diriamba',        N'Agencia Jinotepe'),
 (N'Jinotepe',        N'Agencia Jinotepe'),
 (N'León',            N'Agencia León'),
 (N'La Paz Centro',   N'Agencia León'),
 (N'Chinandega',      N'Agencia Chinandega'),
 (N'Corinto',         N'Agencia Chinandega'),
 (N'Estelí',          N'Agencia Estelí'),
 (N'Condega',         N'Agencia Estelí'),
 (N'Matagalpa',       N'Agencia Matagalpa'),
 (N'Sébaco',          N'Agencia Matagalpa');

DECLARE @identity BIT = COLUMNPROPERTY(OBJECT_ID(N'Cat.Cat_Asig_Municipio'), N'ID', 'IsIdentity');

IF @identity = 1
BEGIN
    INSERT INTO Cat.Cat_Asig_Municipio (MUNICIPIO, AGENCIA)
    SELECT m.MUNICIPIO, m.AGENCIA
    FROM @municipios m
    WHERE NOT EXISTS (SELECT 1 FROM Cat.Cat_Asig_Municipio x WHERE x.MUNICIPIO = m.MUNICIPIO);
END
ELSE
BEGIN
    -- ID sin IDENTITY: se numera a partir del máximo actual
    DECLARE @base INT = (SELECT ISNULL(MAX(ID), 0) FROM Cat.Cat_Asig_Municipio);
    INSERT INTO Cat.Cat_Asig_Municipio (ID, MUNICIPIO, AGENCIA)
    SELECT @base + ROW_NUMBER() OVER (ORDER BY m.MUNICIPIO), m.MUNICIPIO, m.AGENCIA
    FROM @municipios m
    WHERE NOT EXISTS (SELECT 1 FROM Cat.Cat_Asig_Municipio x WHERE x.MUNICIPIO = m.MUNICIPIO);
END
PRINT CONCAT('Municipios insertados: ', @@ROWCOUNT);

-- ---------- Cat_Asig_Gt_Visitas (Resultado, Prioridad) --- sin CRUD en la app, solo para que el SP tenga insumos ----------
DECLARE @visitas TABLE (Resultado NVARCHAR(100), Prioridad INT);
INSERT INTO @visitas VALUES
 (N'Equipo retirado', 1), (N'Cliente ausente', 2), (N'Dirección incorrecta', 3), (N'Cliente rechaza retiro', 4),
 (N'Equipo no encontrado', 5), (N'Reagendado', 2), (N'Zona de riesgo', 6), (N'Cliente fallecido', 7),
 (N'Equipo dañado', 3), (N'Visita fallida', 5);

INSERT INTO Cat.Cat_Asig_Gt_Visitas (Resultado, Prioridad)
SELECT v.Resultado, v.Prioridad
FROM @visitas v
WHERE NOT EXISTS (SELECT 1 FROM Cat.Cat_Asig_Gt_Visitas x WHERE x.Resultado = v.Resultado);
PRINT CONCAT('Resultados de visita insertados: ', @@ROWCOUNT);

-- ---------- Cat_Asig_TIPO (TIPO, CATALOGO, TECNOLOGIA, SEGMENTO) --- sin CRUD en la app ----------
DECLARE @tipos TABLE (TIPO NVARCHAR(100), CATALOGO NVARCHAR(100), TECNOLOGIA NVARCHAR(100), SEGMENTO NVARCHAR(100));
INSERT INTO @tipos VALUES
 (N'Decodificador HD',   N'Set-top box',  N'DTH',        N'Residencial'),
 (N'Decodificador 4K',   N'Set-top box',  N'IPTV',       N'Residencial'),
 (N'Módem ADSL',         N'Módem',        N'ADSL',       N'Residencial'),
 (N'Módem VDSL',         N'Módem',        N'VDSL',       N'Residencial'),
 (N'ONT GPON',           N'Fibra óptica', N'FTTH',       N'Residencial'),
 (N'ONT GPON Empresa',   N'Fibra óptica', N'FTTH',       N'Corporativo'),
 (N'Router WiFi 6',      N'Router',       N'FTTH',       N'Residencial'),
 (N'Router Corporativo', N'Router',       N'Metro-E',    N'Corporativo'),
 (N'Antena DTH',         N'Antena',       N'DTH',        N'Residencial'),
 (N'Teléfono IP',        N'Telefonía',    N'VoIP',       N'Corporativo'),
 (N'Módem Cable DOCSIS', N'Módem',        N'HFC',        N'Residencial');

INSERT INTO Cat.Cat_Asig_TIPO (TIPO, CATALOGO, TECNOLOGIA, SEGMENTO)
SELECT t.TIPO, t.CATALOGO, t.TECNOLOGIA, t.SEGMENTO
FROM @tipos t
WHERE NOT EXISTS (SELECT 1 FROM Cat.Cat_Asig_TIPO x WHERE x.TIPO = t.TIPO);
PRINT CONCAT('Tipos de equipo insertados: ', @@ROWCOUNT);
GO

SET NOEXEC OFF;
GO
