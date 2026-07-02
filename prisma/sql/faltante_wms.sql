-- Fuente NUEVA de /deposito/faltantes: renglones de OT Picking Cumplida (WMS) con
-- CantPedida != CantCumplida. Reemplaza la lectura en vivo de
-- EVERWEAR.Ven_PedRenPendientes (Magnus).
--
-- "nroPedOrigen"/"nroRengOrigen" quedan con esos nombres A PROPÓSITO: son alias de
-- NroMovVenta/Renglon (OTItemNroRenglon) para que preparado.faltante_existencia
-- (check manual), preparado.faltante_novedad y compras/faltantes-consumo sigan
-- funcionando SIN CAMBIOS — tratan esa clave como opaca, no como algo específico
-- de Magnus.
--
-- Se puebla automático (best-effort, sin carga a mano) desde
-- app/api/deposito/faltantes/route.ts en cada carga, llamando a indicadores-api
-- GET /deposito/ot-diferencias. Clave real: (otId, renglon) — una OT Cumplida no
-- cambia, así que el upsert es idempotente sin importar cuántas veces se recorra
-- el mismo rango de fechas.
--
-- Aplicar a mano en Postgres (las migraciones de este proyecto van por SQL, ver
-- FLUJO-DE-TRABAJO.md). El rebuild de Docker NO toca la base.

CREATE TABLE IF NOT EXISTS preparado.faltante_wms (
  id              SERIAL        PRIMARY KEY,
  fecha           DATE          NOT NULL,
  "otId"          INTEGER       NOT NULL,
  renglon         INTEGER       NOT NULL,
  "nroPedOrigen"  INTEGER,
  "nroRengOrigen" INTEGER       NOT NULL,
  operario        TEXT          NOT NULL DEFAULT '',
  cliente         TEXT          NOT NULL DEFAULT '',
  vendedor        TEXT          NOT NULL DEFAULT '',
  ubicacion       TEXT          NOT NULL DEFAULT '',
  "codArticulo"   TEXT          NOT NULL DEFAULT '',
  "cantPedida"    NUMERIC(14,2) NOT NULL DEFAULT 0,
  "cantCumplida"  NUMERIC(14,2) NOT NULL DEFAULT 0,
  diferencia      NUMERIC(14,2) NOT NULL DEFAULT 0,
  "updatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uniq_faltante_wms UNIQUE ("otId", renglon)
);

CREATE INDEX IF NOT EXISTS idx_faltante_wms_fecha ON preparado.faltante_wms (fecha);
CREATE INDEX IF NOT EXISTS idx_faltante_wms_ped ON preparado.faltante_wms ("nroPedOrigen", "nroRengOrigen");
