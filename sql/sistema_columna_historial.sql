-- Historial de columnas por tarjeta: registra CADA entrada de una tarjeta a una columna,
-- para ver el recorrido completo (no solo la columna actual — eso ya lo cubre
-- sistema_tarjeta."columnaDesde"). Se llena automáticamente desde el backend: al crear
-- la tarjeta (columna inicial) y cada vez que cambia de columna, sea por drag&drop
-- (endpoint /api/sistema/tarjetas/reorder) o PATCH directo (/api/sistema/tarjetas/[id]).
--
-- También agrega el auto-completado de "fin" en el tablero Softech: al mover una
-- tarjeta a cualquier columna que no sea "Pendiente" o "En espera" se guarda
-- campos.fin = ahora; si vuelve a una de esas dos, se limpia. Ya no se pide a mano en
-- el formulario (ver SistemaClient.tsx, campo auto:true).
--
-- Requiere sql/sistema_columna_entrada.sql corrido ANTES (usa t."columnaDesde", que ese
-- script agrega — si no está corrido todavía en prod, correrlo primero).
-- Correr UNA VEZ contra la base y después `npx prisma db pull && npx prisma generate`
-- (mismo flujo que sistema_init.sql / sistema_vinculacion.sql).

CREATE TABLE IF NOT EXISTS sistema.sistema_columna_historial (
  id SERIAL PRIMARY KEY,
  "tarjetaId" INTEGER NOT NULL REFERENCES sistema.sistema_tarjeta(id) ON DELETE CASCADE,
  "columnaId" INTEGER NOT NULL REFERENCES sistema.sistema_columna(id) ON DELETE CASCADE,
  "entradaEn" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sistema_columna_historial_tarjeta
  ON sistema.sistema_columna_historial ("tarjetaId");

-- Backfill: las tarjetas que ya existen no tienen historial previo (no se puede
-- reconstruir), así que se les crea una primera entrada con su columna y
-- columnaDesde actuales, para que no queden con el historial vacío.
INSERT INTO sistema.sistema_columna_historial ("tarjetaId", "columnaId", "entradaEn")
SELECT t.id, t."columnaId", t."columnaDesde"
FROM sistema.sistema_tarjeta t
WHERE NOT EXISTS (
  SELECT 1 FROM sistema.sistema_columna_historial h WHERE h."tarjetaId" = t.id
);

-- Backfill opcional: tarjetas de Softech que ya están en una columna "cerrada"
-- (cualquiera menos Pendiente/En espera) pero les falta campos.fin — se completa con
-- columnaDesde como mejor aproximación disponible. No pisa valores ya cargados
-- (los casos históricos importados del Excel ya traían "fin").
UPDATE sistema.sistema_tarjeta t
SET campos = jsonb_set(t.campos, '{fin}', to_jsonb(t."columnaDesde"::text), true)
FROM sistema.sistema_tablero tb, sistema.sistema_columna c
WHERE t."tableroId" = tb.id
  AND t."columnaId" = c.id
  AND tb.clave = 'softech'
  AND lower(trim(c.nombre)) NOT IN ('pendiente', 'en espera')
  AND (t.campos ->> 'fin') IS NULL;
