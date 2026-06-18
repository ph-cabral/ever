// app/rrhh/legajos/page.tsx  (server component)
import { prisma } from "@/lib/prisma";
import LegajosClient from "./_components/LegajosClient";

export const dynamic = "force-dynamic";

type SP = { q?: string; estado?: string; sectorId?: string };

export default async function LegajosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { nombre: { contains: q, mode: "insensitive" } },
      { dni: { contains: q } },
      { cuil: { contains: q } },
      { codigo: { contains: q, mode: "insensitive" } },
      { employeeNo: { contains: q } },
    ];
  }
  if (sp.estado) where.estado = sp.estado;
  if (sp.sectorId) where.sectorId = Number(sp.sectorId);

  const [legajos, sectores] = await Promise.all([
    prisma.legajo.findMany({
      where,
      select: {
        id: true,
        codigo: true,
        nombre: true,
        dni: true,
        cuil: true,
        employeeNo: true,
        estado: true,
        sectorRel: { select: { nombre: true } },
      },
      orderBy: { nombre: "asc" },
      take: 300,
    }),
    prisma.sector.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  const data = legajos.map((l) => ({
    id: l.id,
    codigo: l.codigo,
    nombre: l.nombre,
    dni: l.dni,
    employeeNo: l.employeeNo,
    estado: l.estado,
    sector: l.sectorRel?.nombre ?? "",
  }));

  return (
    <LegajosClient
      legajos={data}
      sectores={sectores}
      filtros={{ q, estado: sp.estado ?? "", sectorId: sp.sectorId ?? "" }}
    />
  );
}
