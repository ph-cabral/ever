/*
  Denormalización de cliente en `trabajo`.

  Los clientes pasan a leerse en vivo de Magnus (MAGNUS_SITD.dbo.Clientes) desde
  /manguera/corte. Por eso se quita el FK a everwear.cliente y el nombre del
  cliente se guarda directo en el trabajo (clienteNombre). `clienteNumero` queda
  como columna simple (sin FK). La tabla everwear.cliente queda en desuso.
*/

-- DropForeignKey
ALTER TABLE "fabrica"."trabajo" DROP CONSTRAINT IF EXISTS "trabajo_clienteNumero_fkey";

-- AlterTable
ALTER TABLE "fabrica"."trabajo" ADD COLUMN "clienteNombre" VARCHAR(150);

-- Backfill: copiar el nombre actual desde la tabla cliente para los trabajos ya cargados
UPDATE "fabrica"."trabajo" t
SET "clienteNombre" = c."nombre"
FROM "everwear"."cliente" c
WHERE t."clienteNumero" = c."numero"
  AND t."clienteNombre" IS NULL;
