-- Foto periódica de los estados del WMS (KPI), para el gráfico "OT en cada
-- estado por hora" de /deposito/wms (líneas En espera / Disponibles / Cumplidos
-- acumulado). Se llena solo desde indicadores-api (ver
-- deposito.py::guardar_snapshot_wms_estados + el loop en main.py), misma
-- cadencia que el snapshot de Abiertos (PEDIDOS_ABIERTOS_SNAPSHOT_INTERVALO_MIN,
-- 15 min). Correr esto en Postgres (n8n_sql, db "n8n") ANTES de deployar el
-- cambio de indicadores-api, si no el INSERT del snapshotter falla.
--
-- Pablo, 2026-07-24: el gráfico reconstruido desde las marcas de la OT no
-- coincidía con las tarjetas KPI (backlog de días previos + "En proceso" por
-- progreso de ítem, no por PickIni). Igual que Abiertos, se guarda la FOTO real
-- del resumen (fetch_wms_estados) para que el gráfico dé exactamente lo mismo
-- que los KPI. Guardamos los 3 valores del resumen:
--   · en_espera  = Pendiente (bucket espera)
--   · en_proceso = En proceso (bucket proceso)
--   · terminadas = Cumplido (bucket fin, acumulado del día)
-- El gráfico deriva: Disponibles = en_espera + en_proceso; Cumplidos = terminadas.

CREATE SCHEMA IF NOT EXISTS deposito;

CREATE TABLE IF NOT EXISTS deposito.wms_estados_snapshot (
    id         serial PRIMARY KEY,
    ts         timestamp NOT NULL,   -- naive, hora Argentina (ver _ahora_ar en deposito.py)
    en_espera  integer   NOT NULL,
    en_proceso integer   NOT NULL,
    terminadas integer   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wms_estados_snapshot_ts
    ON deposito.wms_estados_snapshot (ts);
