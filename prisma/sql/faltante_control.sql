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
