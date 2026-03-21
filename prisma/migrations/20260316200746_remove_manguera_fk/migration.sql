/*
  Warnings:

  - You are about to drop the column `mangueraId` on the `corte` table. All the data in the column will be lost.
  - Added the required column `codigo` to the `corte` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "fabrica"."corte" DROP CONSTRAINT "corte_mangueraId_fkey";

-- DropIndex
DROP INDEX "fabrica"."corte_mangueraId_idx";

-- AlterTable
ALTER TABLE "fabrica"."corte" DROP COLUMN "mangueraId",
ADD COLUMN     "codigo" TEXT NOT NULL;
