import { prisma } from "@/lib/prisma";
import type { LegajoUpdate } from "./legajoSchema";

const relations = {
  familiares: true, beneficiarios: true, estudios: true,
  idiomas: true, equipos: true, antecedentesSrt: true,
} as const;

export async function getLegajoFormValues(id: number) {
  return prisma.legajo.findUnique({ where: { id }, include: relations });
}

export async function updateLegajo(id: number, data: LegajoUpdate) {
  return prisma.legajo.update({ where: { id }, data });
}
