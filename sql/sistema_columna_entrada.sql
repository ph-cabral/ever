-- Módulo "sistema": trackear fecha/hora de ENTRADA a la columna actual, separado de
-- createdAt (alta original de la tarjeta) y de campos.fecha (campo de negocio editable).
-- Se usa para autoordenar las columnas sin orden manual (ver COLUMNAS_ORDEN_MANUAL en
-- SistemaClient.tsx) por "hace cuánto está en esta columna" en vez de "cuándo se creó".
-- Correr UNA VEZ contra la base (n8n_sql:5432/n8n) con DDL directo.
-- Después: `npx prisma db pull && npx prisma generate` (NO usar migrate dev, multi-schema).

BEGIN;

ALTER TABLE sistema.sistema_tarjeta
  ADD COLUMN IF NOT EXISTS "columnaDesde" TIMESTAMP(3);

-- Backfill: para tarjetas existentes no hay forma de saber cuándo entraron a la
-- columna actual, así que se usa createdAt como mejor aproximación disponible. De acá
-- en adelante columnaDesde se actualiza en cada cambio real de columnaId.
UPDATE sistema.sistema_tarjeta
SET "columnaDesde" = "createdAt"
WHERE "columnaDesde" IS NULL;

ALTER TABLE sistema.sistema_tarjeta
  ALTER COLUMN "columnaDesde" SET NOT NULL,
  ALTER COLUMN "columnaDesde" SET DEFAULT now();

COMMIT;
