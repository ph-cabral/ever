-- Tabla "lugar" para /rrhh/legajos y /rrhh/asistencia — a pedido de Pablo (2026-07-30).
--
-- Distinta de área/sector (que son jerárquicos y sirven para permisos/horarios):
-- lugar es una lista plana pensada para selección rápida por legajo (Oficina,
-- Depósito, Fábrica, etc.). Se usa para reagrupar el widget de "presentes" en
-- /rrhh/asistencia, que hasta ahora agrupaba por área.
--
-- Alta de lugares nuevos: desde la UI (botón "+" en el selector de legajo), no
-- hace falta tocar SQL de nuevo salvo para este alta inicial.
--
-- Correr en Postgres (schema "everwear", mismo que legajo/area/sector) y después
-- `prisma db pull` (multiSchema no soporta `migrate dev`) antes de deployar.

CREATE TABLE IF NOT EXISTS everwear.lugar (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(80) NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE everwear.legajo
  ADD COLUMN IF NOT EXISTS "lugarId" INT REFERENCES everwear.lugar(id);

INSERT INTO everwear.lugar (nombre) VALUES
  ('Oficina'), ('Depósito'), ('Fábrica')
ON CONFLICT (nombre) DO NOTHING;
