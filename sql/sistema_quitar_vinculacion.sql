-- Elimina el sistema de vinculación entre tableros.
-- Las tarjetas vinculadas pasan a pertenecer al tablero al que estaban vinculadas
-- (ej: vinculada a softech → queda en softech).
-- Correr UNA VEZ contra la base (n8n_sql:5432/n8n). Después: npx prisma db pull && npx prisma generate.

BEGIN;

UPDATE sistema.sistema_tarjeta
SET "tableroId" = "vinculadoTableroId"
WHERE "vinculadoTableroId" IS NOT NULL;

ALTER TABLE sistema.sistema_tarjeta DROP CONSTRAINT IF EXISTS sistema_tarjeta_vinc_fk;
ALTER TABLE sistema.sistema_tarjeta DROP COLUMN IF EXISTS "vinculadoTableroId";

COMMIT;
