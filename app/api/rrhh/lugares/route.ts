import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/rrhh/lugares — lista plana para el selector rápido de legajo.
export async function GET() {
  const lugares = await prisma.lugar.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
  return NextResponse.json(lugares);
}

// POST /api/rrhh/lugares  { nombre }
// Alta rápida desde el botón "+" del selector (LugarSelect). Upsert por nombre
// para no duplicar si ya existe.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const nombre = String(body?.nombre ?? "").trim();
    if (!nombre) {
      return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
    }

    const lugar = await prisma.lugar.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
    return NextResponse.json(lugar);
  } catch (error) {
    console.error("POST /api/rrhh/lugares", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
