/* ============================================================================
   DESCUBRIR LA FACTURACIÓN DEL DÍA EN MAGNUS  (script para correr en SSMS)
   ----------------------------------------------------------------------------
   Objetivo: encontrar la TABLA y las COLUMNAS donde Magnus guarda los
   comprobantes de venta para poder sumar lo que entra (código 11) y restar
   las notas de crédito / devoluciones (códigos 22, 23, 24, 25).

   Cómo usarlo: abrir en SQL Server Management Studio (SSMS) conectado al
   mismo servidor que usa la app (db.py -> SQL_SERVER) y EJECUTAR DE A UN PASO.
   Copiá/pegá los resultados de cada paso y los terminamos de armar juntos.

   Bases conocidas:  EVERWEAR  y  MAGNUS_SITD
   Fechas en Magnus: muchas tablas guardan la fecha como ENTERO = días desde
                     1800-12-28 (ver PASO 6 para convertir).
   ============================================================================ */
SET NOCOUNT ON;

/* ----------------------------------------------------------------------------
   PASO 1 — ¿QUÉ SON LOS CÓDIGOS 11 / 22 / 23 / 24 / 25?
   El catálogo de comprobantes ya lo usa la app (Ven_CodComprobante).
   Esto nos dice el NOMBRE de cada código (Factura, Nota de Crédito, etc.)
   y confirma que 11 suma y 22..25 restan.
---------------------------------------------------------------------------- */
SELECT *
FROM   MAGNUS_SITD.dbo.Ven_CodComprobante
WHERE  CompCodigo IN (11, 22, 23, 24, 25)
ORDER  BY CompCodigo;

-- (contexto) todos los comprobantes, por si los códigos reales viven en otro lado:
-- SELECT * FROM MAGNUS_SITD.dbo.Ven_CodComprobante ORDER BY CompCodigo;


/* ----------------------------------------------------------------------------
   PASO 2 — TABLAS CANDIDATAS POR NOMBRE  (en las dos bases)
   Buscamos tablas cuyo nombre sugiera comprobantes / facturación / ventas.
   NOTA: EVERWEAR y MAGNUS_SITD tienen collations distintas (Modern_Spanish vs
   SQL_Latin1); por eso el UNION ALL lleva COLLATE DATABASE_DEFAULT en las
   columnas de texto (si no, SQL Server tira "conflicto de intercalación").
---------------------------------------------------------------------------- */
SELECT 'EVERWEAR' AS Base,
       t.TABLE_SCHEMA COLLATE DATABASE_DEFAULT AS TABLE_SCHEMA,
       t.TABLE_NAME   COLLATE DATABASE_DEFAULT AS TABLE_NAME
FROM   EVERWEAR.INFORMATION_SCHEMA.TABLES t
WHERE  t.TABLE_TYPE = 'BASE TABLE'
  AND (t.TABLE_NAME LIKE '%Comprob%' OR t.TABLE_NAME LIKE '%Factur%'
    OR t.TABLE_NAME LIKE '%MovVent%' OR t.TABLE_NAME LIKE '%Vta%'
    OR t.TABLE_NAME LIKE '%Venta%'   OR t.TABLE_NAME LIKE '%Fac_%'
    OR t.TABLE_NAME LIKE '%Caja%'    OR t.TABLE_NAME LIKE '%Diario%')
UNION ALL
SELECT 'MAGNUS_SITD' AS Base,
       t.TABLE_SCHEMA COLLATE DATABASE_DEFAULT,
       t.TABLE_NAME   COLLATE DATABASE_DEFAULT
FROM   MAGNUS_SITD.INFORMATION_SCHEMA.TABLES t
WHERE  t.TABLE_TYPE = 'BASE TABLE'
  AND (t.TABLE_NAME LIKE '%Comprob%' OR t.TABLE_NAME LIKE '%Factur%'
    OR t.TABLE_NAME LIKE '%MovVent%' OR t.TABLE_NAME LIKE '%Vta%'
    OR t.TABLE_NAME LIKE '%Venta%'   OR t.TABLE_NAME LIKE '%Fac_%'
    OR t.TABLE_NAME LIKE '%Caja%'    OR t.TABLE_NAME LIKE '%Diario%')
ORDER  BY Base, TABLE_NAME;


/* ----------------------------------------------------------------------------
   PASO 3 — TABLAS QUE TIENEN A LA VEZ:  código de comprobante + importe + fecha
   Heurística: cruzamos columnas por nombre. La tabla de facturación casi seguro
   aparece acá (tiene una columna tipo CompCodigo, una tipo Importe/Total/Neto y
   una tipo Fecha).  Mirar la columna "PistaImporte" / "PistaCodigo".
---------------------------------------------------------------------------- */
;WITH cols AS (
    SELECT 'EVERWEAR' AS Base,
           TABLE_NAME  COLLATE DATABASE_DEFAULT AS TABLE_NAME,
           COLUMN_NAME COLLATE DATABASE_DEFAULT AS COLUMN_NAME
    FROM   EVERWEAR.INFORMATION_SCHEMA.COLUMNS
    UNION ALL
    SELECT 'MAGNUS_SITD' AS Base,
           TABLE_NAME  COLLATE DATABASE_DEFAULT,
           COLUMN_NAME COLLATE DATABASE_DEFAULT
    FROM   MAGNUS_SITD.INFORMATION_SCHEMA.COLUMNS
)
SELECT  c.Base, c.TABLE_NAME,
        MAX(CASE WHEN c.COLUMN_NAME LIKE '%CompCodigo%' OR c.COLUMN_NAME LIKE '%TipoComp%'
                  OR c.COLUMN_NAME LIKE '%CodComp%'    OR c.COLUMN_NAME LIKE '%Comprob%'
                 THEN c.COLUMN_NAME END)                         AS PistaCodigo,
        MAX(CASE WHEN c.COLUMN_NAME LIKE '%Importe%'  OR c.COLUMN_NAME LIKE '%Total%'
                  OR c.COLUMN_NAME LIKE '%Neto%'      OR c.COLUMN_NAME LIKE '%Gravado%'
                 THEN c.COLUMN_NAME END)                         AS PistaImporte,
        MAX(CASE WHEN c.COLUMN_NAME LIKE '%IVA%' THEN c.COLUMN_NAME END) AS PistaIVA,
        MAX(CASE WHEN c.COLUMN_NAME LIKE '%Fecha%' OR c.COLUMN_NAME LIKE '%Fec%'
                 THEN c.COLUMN_NAME END)                         AS PistaFecha
FROM    cols c
GROUP BY c.Base, c.TABLE_NAME
HAVING  MAX(CASE WHEN c.COLUMN_NAME LIKE '%CompCodigo%' OR c.COLUMN_NAME LIKE '%TipoComp%'
                  OR c.COLUMN_NAME LIKE '%CodComp%'    OR c.COLUMN_NAME LIKE '%Comprob%'
                 THEN 1 END) = 1
   AND  MAX(CASE WHEN c.COLUMN_NAME LIKE '%Importe%'  OR c.COLUMN_NAME LIKE '%Total%'
                  OR c.COLUMN_NAME LIKE '%Neto%'      OR c.COLUMN_NAME LIKE '%Gravado%'
                 THEN 1 END) = 1
ORDER BY c.Base, c.TABLE_NAME;


/* ----------------------------------------------------------------------------
   PASO 4 — COLUMNAS COMPLETAS DE UNA TABLA CANDIDATA
   Reemplazá <TABLA> por una de las que salió en el PASO 3 para ver TODAS sus
   columnas (nombre + tipo) y decidir cuál es el importe, el neto, el IVA y la
   fecha exactos.
---------------------------------------------------------------------------- */
-- SELECT COLUMN_NAME, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE
-- FROM   EVERWEAR.INFORMATION_SCHEMA.COLUMNS         -- ó MAGNUS_SITD.INFORMATION_SCHEMA.COLUMNS
-- WHERE  TABLE_NAME = '<TABLA>'
-- ORDER  BY ORDINAL_POSITION;


/* ----------------------------------------------------------------------------
   PASO 5 — MUESTRA DE FILAS DEL DÍA, FILTRADAS POR LOS CÓDIGOS
   Reemplazá <TABLA>, <COL_CODIGO> y <COL_FECHA>. Esto confirma que la tabla es
   la correcta: tienen que aparecer comprobantes de hoy con códigos 11/22/23/24/25.
   (Si <COL_FECHA> es un entero de días, ver PASO 6 para el filtro de "hoy").
---------------------------------------------------------------------------- */
-- SELECT TOP 50 *
-- FROM   EVERWEAR.dbo.<TABLA>
-- WHERE  <COL_CODIGO> IN (11, 22, 23, 24, 25)
-- ORDER  BY <COL_FECHA> DESC;


/* ----------------------------------------------------------------------------
   PASO 6 — CÓMO FILTRAR "HOY" SEGÚN EL TIPO DE LA COLUMNA DE FECHA
---------------------------------------------------------------------------- */
-- Día de hoy como ENTERO de Magnus (días desde 1800-12-28):
SELECT DATEDIFF(day, '1800-12-28', CAST(GETDATE() AS date)) AS HoyComoEnteroMagnus;

-- · Si <COL_FECHA> es ENTERO:   WHERE <COL_FECHA> = DATEDIFF(day,'1800-12-28',CAST(GETDATE() AS date))
-- · Si <COL_FECHA> es datetime: WHERE CAST(<COL_FECHA> AS date) = CAST(GETDATE() AS date)


/* ----------------------------------------------------------------------------
   PASO 7 (objetivo final) — TOTAL DEL DÍA, una vez identificada la tabla.
   Ejemplo ya armado (descomentar y reemplazar los <...>). Da entra/sale/neto.
---------------------------------------------------------------------------- */
-- DECLARE @hoy int = DATEDIFF(day, '1800-12-28', CAST(GETDATE() AS date));
-- SELECT
--   SUM(CASE WHEN <COL_CODIGO> = 11               THEN <COL_IMPORTE> ELSE 0 END) AS Entra_Cod11,
--   SUM(CASE WHEN <COL_CODIGO> IN (22,23,24,25)   THEN <COL_IMPORTE> ELSE 0 END) AS Sale_Cod22a25,
--   SUM(CASE WHEN <COL_CODIGO> = 11               THEN <COL_IMPORTE>
--            WHEN <COL_CODIGO> IN (22,23,24,25)   THEN -<COL_IMPORTE> ELSE 0 END) AS Neto_ConIVA
-- FROM   EVERWEAR.dbo.<TABLA>
-- WHERE  <COL_CODIGO> IN (11,22,23,24,25)
--   AND  <COL_FECHA> = @hoy;        -- (o el filtro datetime del PASO 6)
