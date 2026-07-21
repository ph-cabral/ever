import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — recorrido completo de columnas por las que pasó una tarjeta (orden cronológico).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tarjetaId = Number(id);
    if (isNaN(tarjetaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const historial = await prisma.sistema_columna_historial.findMany({
      where: { tarjetaId },
      orderBy: { entradaEn: "asc" },
      include: { columna: { select: { nombre: true } } },
    });

    return NextResponse.json(
      historial.map((h) => ({
        columnaId: h.columnaId,
        columnaNombre: h.columna.nombre,
        entradaEn: h.entradaEn,
      }))
    );
  } catch (error) {
    console.error("GET /api/sistema/tarjetas/[id]/historial", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
