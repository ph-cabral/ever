-- Ajuste manual de facturación para /finanza (widget "Facturacion Mini") — a
-- pedido de Pablo (2026-07-31), caso real: Todo Goma (CodCliente 5226) tiene
-- un presupuesto impreso (Ctrl. A 0002-00041879, 30/07/2026, Total
-- $3.790.526,47) que NO existe en ningún lado de Magnus (ni Ven_CompCabecera,
-- ni VenFer_PedidoCabecera, ni EVERWEAR.dbo.Pre_PresupCab — se buscó por
-- número de comprobante, por fecha+total y en el listado completo del día,
-- 0 coincidencias). Al no haber fila de origen, el widget nunca puede
-- "leerlo" solo — necesita un registro manual explícito.
--
-- Esta tabla permite cargar ventas reales que quedaron fuera del circuito
-- de facturación (dinero real que no generó un comprobante en el sistema).
-- finanza.py (fetch_facturacion_dia) suma SUM(neto)/SUM(total) de esta tabla
-- por fecha al neto_sin_iva/neto_con_iva calculado desde Magnus.
--
-- Guarda neto/iva/total por separado (no solo un monto) porque el widget
-- muestra el NETO sin IVA — con los 3 campos separados se puede recalcular
-- si el widget cambia a mostrar el total con IVA más adelante.
--
-- Correr en Postgres (mismo host/red que db_pg.py — POSTGRES_DSN en el
-- .env de indicadores-api) antes de deployar el cambio de finanza.py/main.py.

CREATE SCHEMA IF NOT EXISTS finanza;

CREATE TABLE IF NOT EXISTS finanza.ajuste_manual (
  id             SERIAL PRIMARY KEY,
  fecha          DATE    NOT NULL,
  neto           NUMERIC NOT NULL,   -- neto gravado (sin IVA) — lo que suma el widget
  iva            NUMERIC,            -- opcional
  total          NUMERIC,            -- opcional (con IVA); si es NULL se asume = neto
  cod_cliente    INT,
  cliente_nombre TEXT,
  comprobante    TEXT,               -- ej. "PRESUP. A 0002-00041879"
  motivo         TEXT,
  usuario        TEXT,               -- quién lo cargó
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finanza_ajuste_manual_fecha
  ON finanza.ajuste_manual (fecha);
