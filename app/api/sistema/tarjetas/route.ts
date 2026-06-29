import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — crear tarjeta en una columna
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { columnaId, campos } = body;

    if (!columnaId) {
      return NextResponse.json({ error: "Falta columnaId" }, { status: 400 });
    }

    const max = await prisma.sistema_tarjeta.aggregate({
      where: { columnaId: Number(columnaId) },
      _max: { orden: true },
    });
    const orden = (max._max.orden ?? -1) + 1;

    const tarjeta = await prisma.sistema_tarjeta.create({
      data: {
        columnaId: Number(columnaId),
        orden,
        campos: campos ?? {},
      },
    });

    return NextResponse.json(tarjeta, { status: 201 });
  } catch (error) {
    console.error("POST /api/sistema/tarjetas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
