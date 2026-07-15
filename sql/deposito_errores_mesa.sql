-- Registro de Errores — Mesa de Control (widget de escritorio).
-- Correr UNA VEZ contra la base (n8n_sql:5432/n8n) con DDL directo. Idempotente.
-- No requiere tocar prisma/schema.prisma (esta tabla la escribe indicadores-api
-- directo por psycopg2, no por Prisma).

CREATE SCHEMA IF NOT EXISTS deposito;

CREATE TABLE IF NOT EXISTS deposito.errores_mesa (
  id SERIAL PRIMARY KEY,
  "nroPedido"      INTEGER      NOT NULL,
  fecha            DATE,
  "tipoPedido"     VARCHAR(30),
  ot               INTEGER,
  aviso            VARCHAR(30)  NOT NULL,
  "nroArmador"     INTEGER,
  "nombreArmador"  VARCHAR(120),
  ubicacion        VARCHAR(120),
  "detalleError"   VARCHAR(200) NOT NULL,
  "createdAt"      TIMESTAMP    NOT NULL DEFAULT now()
);

-- Si la tabla ya existía de una corrida anterior (sin esta columna):
ALTER TABLE deposito.errores_mesa ADD COLUMN IF NOT EXISTS ubicacion VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_errores_mesa_nropedido ON deposito.errores_mesa ("nroPedido");
CREATE INDEX IF NOT EXISTS idx_errores_mesa_createdat ON deposito.errores_mesa ("createdAt");
