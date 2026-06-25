import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAltaUsuario } from "@/lib/auth/guard";
import { modulosForSector } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

// Busca un legajo de everwear por DNI para precargar el alta de usuario.
export async function GET(req: NextRequest) {
  const g = await guardAltaUsuario();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const dni = (new URL(req.url).searchParams.get("dni") ?? "").trim();
  if (!dni) return NextResponse.json({ error: "Falta el DNI" }, { status: 400 });

  const legajo = await prisma.legajo.findUnique({
    where: { dni },
    select: {
      id: true,
      nombre: true,
      sector: true,
      sectorRel: { select: { nombre: true } },
      estado: true,
      usuario: { select: { id: true } },
    },
  });

  if (!legajo) return NextResponse.json({ found: false, bootstrap: g.bootstrap });

  // Sector efectivo: la relación (tabla sector) manda; si no, el string libre.
  const sector = legajo.sectorRel?.nombre ?? legajo.sector ?? null;
  const modulos = await modulosForSector(sector);
  return NextResponse.json({
    found: true,
    bootstrap: g.bootstrap,
    legajoId: legajo.id,
    nombre: legajo.nombre,
    sector,
    estado: legajo.estado,
    yaTieneUsuario: !!legajo.usuario,
    modulos,
  });
}
