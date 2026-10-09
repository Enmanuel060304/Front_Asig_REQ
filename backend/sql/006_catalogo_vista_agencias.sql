-- Lista de agencias vigentes = las que aparecen en los mapeos de Distrito o Municipio.
-- Va TAMBIÉN a producción. Con AGENCIAS_TABLA=Cat.vw_Agencias, AGENCIAS_COLUMNA_VALOR=AGENCIA y
-- AGENCIAS_COLUMNA_NOMBRE=AGENCIA el paso 3 (equipos sin asignar) ofrece siempre las agencias del catálogo.
-- UNION (sin ALL) ya elimina duplicados.

CREATE OR ALTER VIEW Cat.vw_Agencias AS
SELECT LTRIM(RTRIM(AGENCIA)) AS AGENCIA
FROM Cat.Cat_Asig_Distrito
WHERE AGENCIA IS NOT NULL AND LTRIM(RTRIM(AGENCIA)) <> N''
UNION
SELECT LTRIM(RTRIM(AGENCIA))
FROM Cat.Cat_Asig_Municipio
WHERE AGENCIA IS NOT NULL AND LTRIM(RTRIM(AGENCIA)) <> N'';
GO
