import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — crear columna en un tablero
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tableroId, nombre } = body;

    if (!tableroId || !nombre || !String(nombre).trim()) {
      return NextResponse.json(
        { error: "Faltan campos: tableroId, nombre" },
        { status: 400 }
      );
    }

    const max = await prisma.sistema_columna.aggregate({
      where: { tableroId: Number(tableroId) },
      _max: { orden: true },
    });
    const orden = (max._max.orden ?? -1) + 1;

    const columna = await prisma.sistema_columna.create({
      data: { tableroId: Number(tableroId), nombre: String(nombre).trim(), orden },
    });

    return NextResponse.json(columna, { status: 201 });
  } catch (error) {
    console.error("POST /api/sistema/columnas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
