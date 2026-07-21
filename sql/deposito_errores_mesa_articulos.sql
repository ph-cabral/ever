-- Agrega la columna para guardar qué artículo(s) del pedido eligió el
-- operario en el selector multiple-choice nuevo de los widgets (Mesa de
-- Control y Calidad) — a pedido de Pablo (2026-07-21). Array de texto, 1
-- string por artículo elegido ("CodArticulo - Descripción", ya formateado
-- del lado del server al guardar, no solo el código — ver insert_error_mesa/
-- insert_error_calidad en indicadores-api/errores_mesa.py). Opcional: los
-- widgets no bloquean el guardado si no se eligió ningún artículo (mismo
-- criterio que "observacion").
--
-- Correr en Postgres (n8n_sql, db n8n, schema deposito) antes de deployar el
-- cambio de indicadores-api + ever.
ALTER TABLE deposito.errores_mesa
  ADD COLUMN IF NOT EXISTS articulos text[];
