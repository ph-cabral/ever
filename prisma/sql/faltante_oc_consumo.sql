-- Registro de consumo de OC por día (vista /compras/faltantes).
-- Para cada (día del faltante, artículo) guarda cómo se repartió lo "por llegar"
-- de las Órdenes de Compra (Magnus, en vivo) contra el faltante de ese día.
--
-- La OC se reparte FIFO por fecha: cubre primero el faltante del día más viejo y
-- se va agotando hacia los días más nuevos. Así una misma OC NO figura cubriendo
-- varios días: lo que ya imputó a un día queda restado para los siguientes.
--
-- Es un registro AUTOMÁTICO (se recalcula desde Magnus en cada carga de la vista,
-- "solo automática"): no se carga nada a mano. Sirve de auditoría / histórico del
-- consumo. Clave natural: (fecha del faltante, artículo).
--
-- Aplicar a mano en Postgres (las migraciones de este proyecto van por SQL, ver
-- FLUJO-DE-TRABAJO.md). El rebuild de Docker NO toca la base.

CREATE TABLE IF NOT EXISTS preparado.faltante_oc_consumo (
  id             SERIAL       PRIMARY KEY,
  fecha          DATE         NOT NULL,            -- día del faltante (primera aparición)
  "codArticulo"  TEXT         NOT NULL DEFAULT '',
  faltan         NUMERIC(14,2) NOT NULL DEFAULT 0, -- faltante (sin existencia) de ese día
  "ocImputada"   NUMERIC(14,2) NOT NULL DEFAULT 0, -- unidades de OC que cubren ese día (FIFO)
  descubierto    NUMERIC(14,2) NOT NULL DEFAULT 0, -- faltan - ocImputada
  "ocTotal"      NUMERIC(14,2) NOT NULL DEFAULT 0, -- total por llegar del artículo (Magnus) al calcular
  "updatedAt"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uniq_faltante_oc_consumo UNIQUE (fecha, "codArticulo")
);

CREATE INDEX IF NOT EXISTS idx_faltante_oc_consumo_fecha
  ON preparado.faltante_oc_consumo (fecha);
