-- Módulo "sistema": columnas globales + vinculación de tableros + orquestado.
-- Correr UNA VEZ contra la base (n8n_sql:5432/n8n) con DDL directo.
-- Después: `npx prisma db pull && npx prisma generate` (NO usar migrate dev, multi-schema).
-- ⚠️ Hacé backup del schema `sistema` antes: si dos tableros tienen columnas con el
--    mismo nombre, sus tarjetas se fusionan a esa columna global (es lo buscado).

BEGIN;

-- 1) Tarjeta: dueño/control + vínculo opcional
ALTER TABLE sistema.sistema_tarjeta
  ADD COLUMN IF NOT EXISTS "tableroId" INTEGER,
  ADD COLUMN IF NOT EXISTS "vinculadoTableroId" INTEGER;

-- backfill dueño desde el tablero de su columna actual
UPDATE sistema.sistema_tarjeta tj
SET "tableroId" = c."tableroId"
FROM sistema.sistema_columna c
WHERE c.id = tj."columnaId" AND tj."tableroId" IS NULL;

-- 2) Globalizar columnas por nombre: repuntar tarjetas a la columna canónica (menor id)
WITH canon AS (
  SELECT nombre, MIN(id) AS keep_id FROM sistema.sistema_columna GROUP BY nombre
)
UPDATE sistema.sistema_tarjeta tj
SET "columnaId" = canon.keep_id
FROM sistema.sistema_columna c
JOIN canon ON canon.nombre = c.nombre
WHERE tj."columnaId" = c.id;

-- borrar columnas duplicadas (ya sin tarjetas), dejar la canónica
DELETE FROM sistema.sistema_columna c
USING (SELECT nombre, MIN(id) AS keep_id FROM sistema.sistema_columna GROUP BY nombre) k
WHERE c.nombre = k.nombre AND c.id <> k.keep_id;

-- volver global
ALTER TABLE sistema.sistema_columna DROP COLUMN IF EXISTS "tableroId";
ALTER TABLE sistema.sistema_columna ADD CONSTRAINT sistema_columna_nombre_key UNIQUE (nombre);

-- re-secuenciar orden global
WITH o AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY orden, id) - 1 AS n FROM sistema.sistema_columna
)
UPDATE sistema.sistema_columna c SET orden = o.n FROM o WHERE o.id = c.id;

-- 3) FKs/NN del dueño y vínculo
ALTER TABLE sistema.sistema_tarjeta
  ALTER COLUMN "tableroId" SET NOT NULL,
  ADD CONSTRAINT sistema_tarjeta_tablero_fk
    FOREIGN KEY ("tableroId") REFERENCES sistema.sistema_tablero(id) ON DELETE CASCADE,
  ADD CONSTRAINT sistema_tarjeta_vinc_fk
    FOREIGN KEY ("vinculadoTableroId") REFERENCES sistema.sistema_tablero(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sistema_tarjeta_tablero ON sistema.sistema_tarjeta ("tableroId");

-- 4) Columnas ocultas por tablero (default: todas visibles)
CREATE TABLE IF NOT EXISTS sistema.sistema_columna_oculta (
  "tableroId" INTEGER NOT NULL REFERENCES sistema.sistema_tablero(id) ON DELETE CASCADE,
  "columnaId" INTEGER NOT NULL REFERENCES sistema.sistema_columna(id) ON DELETE CASCADE,
  PRIMARY KEY ("tableroId","columnaId")
);

COMMIT;
