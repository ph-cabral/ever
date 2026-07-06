-- Marca "descartar" por (día del faltante, artículo) en /compras/faltantes.
--   · descartado = true → la fila deja de aparecer en CUALQUIER tabla de la
--     vista (principal, agrupada por proveedor y la de extraordinarios/reverso).
--   · NO borra nada: ni el renglón de Magnus, ni la marca "sin existencia"
--     (faltante_existencia), ni ninguna otra tabla. Es solo un filtro de
--     visibilidad en /api/compras/faltantes-consumo (ver keyArtDia + fallback
--     por artículo, mismo criterio que preparado.faltante_extraordinario).
-- Clave natural: (fecha, artículo), igual que faltante_extraordinario/faltante_oc_consumo.
--
-- Aplicar a mano en Postgres (las migraciones de este proyecto van por SQL, ver
-- FLUJO-DE-TRABAJO.md). El rebuild de Docker NO toca la base.

CREATE TABLE IF NOT EXISTS preparado.faltante_descartado (
  id             SERIAL      PRIMARY KEY,
  fecha          DATE        NOT NULL,
  "codArticulo"  TEXT        NOT NULL DEFAULT '',
  descartado     BOOLEAN     NOT NULL DEFAULT true,
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_faltante_descartado UNIQUE (fecha, "codArticulo")
);

CREATE INDEX IF NOT EXISTS idx_faltante_descartado_fecha
  ON preparado.faltante_descartado (fecha);
