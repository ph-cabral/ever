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
  const result = await prisma.legajo.update({
    where: { id },
    data,
    include: { sectorRel: { select: { nombre: true } } },
  });

  // usuario.sector se hornea en la cookie de sesión al loguear (ver lib/auth/permissions.ts)
  // y sólo se setea una vez en el alta (api/auth/register). Si cambia el sector del legajo,
  // hay que resincronizarlo acá o el usuario queda con permisos viejos/vacíos.
  if ("sector" in data || "sectorId" in data) {
    const sectorEfectivo = result.sectorRel?.nombre ?? result.sector ?? null;
    await prisma.usuario.updateMany({
      where: { legajoId: id },
      data: { sector: sectorEfectivo },
    });
  }

  return result;
}
