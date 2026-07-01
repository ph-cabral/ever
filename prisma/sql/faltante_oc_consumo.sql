-- Registro de consumo de OC por día (vista /compras/faltantes).
-- Para cada (día, artículo) guarda "faltan" ACUMULADO (faltan[día] =
-- faltan[día-1] + lo nuevo de ese día, no se resetea) contra lo "por llegar" de
-- las Órdenes de Compra (Magnus, en vivo).
--
-- El día que llega la OC (fechaEntrega) y cubrió con sobrante, el acumulado
-- vuelve a 0 ese mismo día (no se arrastra crédito viejo al ciclo siguiente).
-- Si NO alcanzó a cubrir, el descubierto real sigue acumulando tal cual.
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
  faltan         NUMERIC(14,2) NOT NULL DEFAULT 0, -- acumulado hasta ese día (no solo lo nuevo)
  "ocImputada"   NUMERIC(14,2) NOT NULL DEFAULT 0, -- unidades de OC que cubren ese día (FIFO)
  descubierto    NUMERIC(14,2) NOT NULL DEFAULT 0, -- faltan - ocImputada
  "ocTotal"      NUMERIC(14,2) NOT NULL DEFAULT 0, -- total por llegar del artículo (Magnus) al calcular
  "updatedAt"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uniq_faltante_oc_consumo UNIQUE (fecha, "codArticulo")
);

CREATE INDEX IF NOT EXISTS idx_faltante_oc_consumo_fecha
  ON preparado.faltante_oc_consumo (fecha);
