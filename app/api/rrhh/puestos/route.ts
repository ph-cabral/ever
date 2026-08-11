// ABM de puestos (schema everwear). Ver /rrhh/puestos.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const puestos = await prisma.puesto.findMany({
    orderBy: { nombre: "asc" },
    include: {
      sector: { select: { id: true, nombre: true, area: { select: { id: true, nombre: true } } } },
      documentos: { select: { documentoId: true } },
    },
  });
  return NextResponse.json(puestos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const nombre = String(body?.nombre ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  const sectorId = body?.sectorId ? Number(body.sectorId) : null;
  if (!sectorId) return NextResponse.json({ error: "Falta el sector" }, { status: 400 });
  try {
    const puesto = await prisma.puesto.create({
      data: {
        nombre,
        descripcion: body?.descripcion ? String(body.descripcion) : null,
        sectorId,
      },
    });
    return NextResponse.json(puesto, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const dup = msg.includes("Unique constraint");
    return NextResponse.json(
      { error: dup ? `Ya existe un puesto "${nombre}"` : msg },
      { status: dup ? 409 : 500 },
    );
  }
}
