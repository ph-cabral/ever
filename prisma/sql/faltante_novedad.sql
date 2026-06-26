-- Novedad de faltantes (vista /deposito/faltantes).
-- Dos tablas:
--   1) faltante_novedad_tipo  → catálogo editable de novedades. El front muestra el
--      nombre pero guarda el id; si se cambia un nombre acá, cambia en todos lados.
--   2) faltante_novedad        → la novedad elegida por renglón (independiente de la
--      marca de existencia). Clave natural (fecha, NroPedOrigen, NroRengOrigen),
--      igual que faltante_existencia / faltante_control.
-- Columnas en camelCase con comillas para que `prisma db pull` las mapee igual.
-- Correr una vez en la BD (psql / cliente). Solo Postgres.

-- 1) Catálogo de novedades ----------------------------------------------------
CREATE TABLE IF NOT EXISTS preparado.faltante_novedad_tipo (
  id          SERIAL       PRIMARY KEY,
  nombre      TEXT         NOT NULL UNIQUE,
  orden       INTEGER      NOT NULL DEFAULT 0,
  activo      BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Opciones iniciales. Para agregar más: INSERT acá (o por la app) — no hace falta
-- tocar la tabla de renglones, que referencia por id.
INSERT INTO preparado.faltante_novedad_tipo (nombre, orden) VALUES
  ('AUTORIZO CLIENTE', 1),
  ('SE CANCELO PEDIDO', 2)
ON CONFLICT (nombre) DO NOTHING;

-- 2) Novedad elegida por renglón ---------------------------------------------
CREATE TABLE IF NOT EXISTS preparado.faltante_novedad (
  id              SERIAL       PRIMARY KEY,
  fecha           DATE         NOT NULL,
  "nroPedOrigen"  INTEGER      NOT NULL,
  "nroRengOrigen" INTEGER      NOT NULL,
  "codArticulo"   TEXT         NOT NULL DEFAULT '',
  "novedadId"     INTEGER      REFERENCES preparado.faltante_novedad_tipo (id) ON DELETE SET NULL,
  "updatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uniq_faltante_novedad UNIQUE (fecha, "nroPedOrigen", "nroRengOrigen")
);

CREATE INDEX IF NOT EXISTS idx_faltante_novedad_fecha ON preparado.faltante_novedad (fecha);
