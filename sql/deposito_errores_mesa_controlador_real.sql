-- Agrega el "controlador real" del pedido (Magnus, Ven_PedImpresoCP.CodControlador1/2 —
-- mismo origen que ya usaba el widget de Calidad, fetch_controlador_pedido en
-- indicadores-api/errores_mesa.py) también para las altas de Mesa de Control.
-- Antes esta info solo se guardaba (mezclada en la columna `controlador`) para
-- origen='calidad'. A pedido de Pablo (2026-07-21): la vista /deposito ahora
-- distingue "Registrada" (quién cargó el error, columna `controlador` de
-- siempre) de "Controlador" (el controlador real del pedido según Magnus).
--
-- Correr en Postgres (n8n_sql, db n8n, schema deposito) antes de deployar el
-- cambio de indicadores-api + ever. Los registros existentes quedan con estas
-- columnas en NULL (no hay backfill automático — requeriría reconsultar
-- Magnus/WMS por cada pedido histórico).
ALTER TABLE deposito.errores_mesa
  ADD COLUMN IF NOT EXISTS "nroControladorReal" integer,
  ADD COLUMN IF NOT EXISTS "nombreControladorReal" text;
