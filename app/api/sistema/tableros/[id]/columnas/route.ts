import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH body: { columnaId, oculta: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const tableroId = Number(id);
    const { columnaId, oculta } = await req.json();
    if (oculta) {
      await prisma.sistema_columna_oculta.upsert({
        where: {
          tableroId_columnaId: { tableroId, columnaId: Number(columnaId) },
        },
        create: { tableroId, columnaId: Number(columnaId) },
        update: {},
      });
    } else {
      await prisma.sistema_columna_oculta.deleteMany({
        where: { tableroId, columnaId: Number(columnaId) },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH tableros/[id]/columnas", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
