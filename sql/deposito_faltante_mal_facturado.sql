-- Tercer estado en /deposito/faltantes: "Mal facturado" (círculo morado), a
-- pedido de Pablo (2026-07-30). Hasta ahora existencia era boolean (si/no);
-- se agrega una columna aparte en vez de convertir existencia a string para
-- no tocar los consumidores existentes de `existencia` (historico/route.ts,
-- compras/metricas, compras/faltantes-consumo, ventas/faltantes,
-- deposito/evaluacion, lib/faltantesArribo.ts): siguen viendo existencia
-- true/false/null exactamente igual que antes. Un renglón marcado "mal
-- facturado" queda con existencia = NULL y mal_facturado = true — para esos
-- consumidores es indistinguible de "todavía sin marcar" hasta que se les
-- agregue soporte explícito (pendiente, no se tocó nada de eso ahora).
--
-- Correr en Postgres antes de deployar el cambio de check/route.ts + page.tsx.

ALTER TABLE preparado.faltante_existencia
  ADD COLUMN IF NOT EXISTS mal_facturado boolean;
