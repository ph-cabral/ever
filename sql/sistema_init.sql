-- Módulo "sistema" (tablero tipo Trello: Sistema interno / Softech / Buren).
-- Correr UNA VEZ contra la base (n8n_sql:5432/n8n) con DDL directo.
-- Después: agregar "sistema" al array `schemas` de prisma/schema.prisma (ya hecho en este
-- diff) y correr `npx prisma db pull && npx prisma generate` — NO usar `migrate dev`
-- (falla con multi-schema por la shadow DB, ver memoria del proyecto).

CREATE SCHEMA IF NOT EXISTS sistema;

CREATE TABLE IF NOT EXISTS sistema.sistema_tablero (
  id SERIAL PRIMARY KEY,
  clave VARCHAR(40) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sistema.sistema_columna (
  id SERIAL PRIMARY KEY,
  "tableroId" INTEGER NOT NULL REFERENCES sistema.sistema_tablero(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sistema_columna_tablero ON sistema.sistema_columna ("tableroId");

CREATE TABLE IF NOT EXISTS sistema.sistema_tarjeta (
  id SERIAL PRIMARY KEY,
  "columnaId" INTEGER NOT NULL REFERENCES sistema.sistema_columna(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 0,
  campos JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sistema_tarjeta_columna ON sistema.sistema_tarjeta ("columnaId");

-- Tableros (uno por área/empresa).
INSERT INTO sistema.sistema_tablero (clave, nombre) VALUES
  ('sistema', 'Sistema (interno)'),
  ('softech', 'Softech'),
  ('buren',   'Buren')
ON CONFLICT (clave) DO NOTHING;

-- Columnas iniciales por tablero (el usuario puede renombrar/agregar/borrar después desde la UI).
INSERT INTO sistema.sistema_columna ("tableroId", nombre, orden)
SELECT t.id, v.nombre, v.orden
FROM (VALUES
  ('sistema', 'Pendiente', 0),
  ('sistema', 'En progreso', 1),
  ('sistema', 'Resuelto', 2),
  ('softech', 'Pendiente', 0),
  ('softech', 'En espera', 1),
  ('softech', 'Parcial / sin solución', 2),
  ('softech', 'Sin solución', 3),
  ('softech', 'Solucionado', 4),
  ('buren',   'Incidentes registrados', 0),
  ('buren',   'En seguimiento', 1)
) AS v(clave, nombre, orden)
JOIN sistema.sistema_tablero t ON t.clave = v.clave
WHERE NOT EXISTS (
  SELECT 1 FROM sistema.sistema_columna c WHERE c."tableroId" = t.id AND c.nombre = v.nombre
);
