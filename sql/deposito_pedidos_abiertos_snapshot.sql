-- Foto periódica de "pedidos Abiertos" en Magnus, para el gráfico "Pedidos por
-- hora" de /deposito/wms (línea Abiertos). Se llena solo, desde
-- indicadores-api (ver deposito.py::guardar_snapshot_abiertos + el loop en
-- main.py), cada PEDIDOS_ABIERTOS_SNAPSHOT_INTERVALO_MIN minutos (15 por
-- defecto). Correr esto en Postgres (n8n_sql, db "n8n") ANTES de deployar el
-- cambio de indicadores-api, si no el INSERT del snapshotter falla.
--
-- Pablo, 2026-07-23: pedido explícito de que el gráfico muestre el total
-- REAL de abiertos en cada momento (no un cálculo reconstruido), para poder
-- ver a qué hora del día hay más/menos pedidos abiertos.

CREATE SCHEMA IF NOT EXISTS deposito;

CREATE TABLE IF NOT EXISTS deposito.pedidos_abiertos_snapshot (
    id       serial PRIMARY KEY,
    ts       timestamp NOT NULL,   -- naive, hora Argentina (ver _ahora_ar en deposito.py)
    abiertos integer   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedidos_abiertos_snapshot_ts
    ON deposito.pedidos_abiertos_snapshot (ts);

-- 2026-07-23 (ampliación): la misma foto guarda ahora el desglose de estados del
-- WMS (OT de Picking) para el gráfico 1 de /deposito/wms — en espera / en proceso
-- / cumplido / sin asignar (ver deposito.py::fetch_wms_breakdown_ahora). Nullable
-- porque las fotos viejas no los tienen y porque si el WMS está caído la foto de
-- abiertos igual se guarda. Correr estos ALTER en Postgres antes de deployar.
ALTER TABLE deposito.pedidos_abiertos_snapshot ADD COLUMN IF NOT EXISTS en_espera   integer;
ALTER TABLE deposito.pedidos_abiertos_snapshot ADD COLUMN IF NOT EXISTS en_proceso  integer;
ALTER TABLE deposito.pedidos_abiertos_snapshot ADD COLUMN IF NOT EXISTS cumplido    integer;
ALTER TABLE deposito.pedidos_abiertos_snapshot ADD COLUMN IF NOT EXISTS sin_asignar integer;
