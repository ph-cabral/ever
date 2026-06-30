-- Permisos finos por vista + visibilidad en el inicio.
-- Agrega columnas a everwear.sector_permiso. Idempotente.
-- Correr contra la base y luego: prisma db pull && prisma generate.

ALTER TABLE everwear.sector_permiso
  ADD COLUMN IF NOT EXISTS vistas  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ocultos jsonb NOT NULL DEFAULT '[]'::jsonb;
