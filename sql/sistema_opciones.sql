-- Módulo "sistema": opciones dinámicas para campos tipo "select" (categoría, ubicación).
-- Correr UNA VEZ contra la base (n8n_sql:5432/n8n) con DDL directo.
-- Después: `npx prisma db pull && npx prisma generate` (NO usar migrate dev, multi-schema).

CREATE TABLE IF NOT EXISTS sistema.sistema_opcion (
  id SERIAL PRIMARY KEY,
  clave VARCHAR(40) NOT NULL,
  campo VARCHAR(50) NOT NULL,
  valor VARCHAR(150) NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (clave, campo, valor)
);

-- Semillas: las opciones de categoría que ya existían hardcodeadas en el front,
-- para que sigan apareciendo aunque ahora vivan en esta tabla.
INSERT INTO sistema.sistema_opcion (clave, campo, valor, orden) VALUES
  ('sistema', 'categoria', 'Impresoras', 0),
  ('sistema', 'categoria', 'Automatización', 1),
  ('sistema', 'categoria', 'Mantenimiento de equipos', 2),
  ('sistema', 'categoria', 'Varios', 3)
ON CONFLICT (clave, campo, valor) DO NOTHING;
