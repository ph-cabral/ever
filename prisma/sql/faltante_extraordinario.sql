-- Marca "pedido extraordinario" + "a comprar" por (día del faltante, artículo).
-- Vista /compras/faltantes:
--   · extraordinario = true  → la fila desaparece de la tabla principal.
--   · extraordinario = true AND comprar = true → aparece en la tabla del
--     reverso (animación de girar la tarjeta, botón "Extraordinario").
-- Clave natural: (fecha, artículo), igual que preparado.faltante_oc_consumo.
--
-- Aplicar a mano en Postgres (las migraciones de este proyecto van por SQL, ver
-- FLUJO-DE-TRABAJO.md). El rebuild de Docker NO toca la base.

CREATE TABLE IF NOT EXISTS preparado.faltante_extraordinario (
  id             SERIAL      PRIMARY KEY,
  fecha          DATE        NOT NULL,
  "codArticulo"  TEXT        NOT NULL DEFAULT '',
  extraordinario BOOLEAN     NOT NULL DEFAULT false,
  comprar        BOOLEAN     NOT NULL DEFAULT false,
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_faltante_extraordinario UNIQUE (fecha, "codArticulo")
);

CREATE INDEX IF NOT EXISTS idx_faltante_extraordinario_fecha
  ON preparado.faltante_extraordinario (fecha);

-- comprar pasa a tri-state: NULL = pendiente de decisión (ventas/faltantes
-- aún no respondió), true/false = decidido (comprar o no). Antes
-- NOT NULL DEFAULT false no permitía distinguir "sin decidir" de "decidido
-- que no". La decisión ahora se toma en /ventas/faltantes (ver
-- app/ventas/faltantes/page.tsx → decidir()), no en /compras/faltantes.
ALTER TABLE preparado.faltante_extraordinario
  ALTER COLUMN comprar DROP DEFAULT,
  ALTER COLUMN comprar DROP NOT NULL;
