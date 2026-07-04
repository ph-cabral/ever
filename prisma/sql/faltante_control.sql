-- Control de faltantes (seguimiento de renglones "sin existencia").
-- Una fila por renglón faltante: fecha de arribo estimada y si el cliente lo sigue queriendo.
-- Clave natural: (fecha del registro de faltantes, NroPedOrigen, NroRengOrigen).
-- Columnas en camelCase con comillas para que `prisma db pull` las mapee igual que faltante_existencia.

CREATE TABLE IF NOT EXISTS preparado.faltante_control (
  id              SERIAL       PRIMARY KEY,
  fecha           DATE         NOT NULL,
  "nroPedOrigen"  INTEGER      NOT NULL,
  "nroRengOrigen" INTEGER      NOT NULL,
  "codArticulo"   TEXT         NOT NULL DEFAULT '',
  "fechaArribo"   DATE,
  "clienteQuiere" BOOLEAN,
  "updatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uniq_faltante_control UNIQUE (fecha, "nroPedOrigen", "nroRengOrigen")
);

CREATE INDEX IF NOT EXISTS idx_faltante_control_fecha ON preparado.faltante_control (fecha);

-- vendido: acción de VENTAS en /ventas/faltantes ("Tabla 2" — renglones con
-- clienteQuiere=true + fechaArribo, ya confirmados por remito de ingreso).
-- NULL = sin decidir (aparece en Tabla 2); true/false = decidido (sale de la
-- tabla en cualquiera de los dos casos). Aplicar a mano en Postgres.
ALTER TABLE preparado.faltante_control
  ADD COLUMN IF NOT EXISTS "vendido" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "vendidoAt" TIMESTAMPTZ;

-- irrelevante: descarte de VENTAS en /ventas/faltantes ("Tabla 1", botón
-- basurero junto a Lo quiere/No lo quiere). No es una decisión del cliente
-- (eso es clienteQuiere) — es "este renglón no corresponde", y saca la fila
-- de la tabla sin más. Aplicar a mano en Postgres.
ALTER TABLE preparado.faltante_control
  ADD COLUMN IF NOT EXISTS "irrelevante" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "irrelevanteAt" TIMESTAMPTZ;
