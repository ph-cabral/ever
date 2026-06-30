import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — crear columna en un tablero
export async function POST(req: NextRequest) {
  try {
    const { nombre } = await req.json();
    if (!nombre?.trim())
      return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
    const max = await prisma.sistema_columna.aggregate({
      _max: { orden: true },
    });
    const col = await prisma.sistema_columna.create({
      data: { nombre: nombre.trim(), orden: (max._max.orden ?? -1) + 1 },
    });
    return NextResponse.json(col, { status: 201 });
  } catch (e) {
    console.error("POST /api/sistema/columnas", e);
    return NextResponse.json(
      { error: "Error interno (¿nombre repetido?)" },
      { status: 500 },
    );
  }
}
