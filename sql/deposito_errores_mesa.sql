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
  controlador      VARCHAR(120) NOT NULL,
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

-- 2026-07-15: se saca el select de Mesa/Reclamos del widget. En su lugar, al
-- abrir el widget se pide un N° de operario (controlador) y se resuelve su
-- nombre contra WMS.Personal (mismo origen que "nombreArmador") — ese nombre
-- va en la columna que antes era "aviso" (Mesa/Reclamos), ahora "controlador".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'deposito' AND table_name = 'errores_mesa' AND column_name = 'aviso'
  ) THEN
    ALTER TABLE deposito.errores_mesa RENAME COLUMN aviso TO controlador;
  END IF;
END $$;
ALTER TABLE deposito.errores_mesa ALTER COLUMN controlador TYPE VARCHAR(120);
