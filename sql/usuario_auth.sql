-- Login de la app: usuarios + permisos por sector. Schema everwear.
-- Aplicar a mano (multi-schema rompe `prisma migrate dev`), igual que el resto de sql/.
--   psql "$DATABASE_URL" -f sql/usuario_auth.sql

-- Usuarios del sistema. Cada uno se vincula a un legajo existente (everwear.legajo).
CREATE TABLE IF NOT EXISTS everwear.usuario (
  id             SERIAL PRIMARY KEY,
  "legajoId"     INTEGER     NOT NULL UNIQUE REFERENCES everwear.legajo(id),
  dni            VARCHAR(20) NOT NULL UNIQUE,
  nombre         VARCHAR(100) NOT NULL,
  "passwordHash" TEXT        NOT NULL,
  rol            VARCHAR(20) NOT NULL DEFAULT 'USUARIO',  -- ADMIN | USUARIO
  sector         VARCHAR(80),
  activo         BOOLEAN     NOT NULL DEFAULT true,
  "ultimoAcceso" TIMESTAMP,
  "createdAt"    TIMESTAMP   NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usuario_dni_idx ON everwear.usuario (dni);

-- Mapa editable sector -> módulos habilitados (array JSON de claves de módulo).
CREATE TABLE IF NOT EXISTS everwear.sector_permiso (
  id          SERIAL PRIMARY KEY,
  sector      VARCHAR(80) NOT NULL UNIQUE,
  modulos     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP   NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP   NOT NULL DEFAULT now()
);

-- Nota: el primer usuario que se registre (cuando la tabla está vacía) queda como ADMIN
-- automáticamente desde /admin/usuarios/nuevo. No hace falta seed manual.
