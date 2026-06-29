import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH — mover/reordenar tarjetas, dentro de una columna o entre columnas.
// body: { cambios: [{ id, columnaId, orden }, ...] }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { cambios } = body;

    if (!Array.isArray(cambios) || cambios.length === 0) {
      return NextResponse.json({ error: "cambios debe ser un array no vacío" }, { status: 400 });
    }
    for (const c of cambios) {
      if (typeof c.id !== "number" || typeof c.columnaId !== "number" || typeof c.orden !== "number") {
        return NextResponse.json(
          { error: "cada cambio requiere id, columnaId, orden (number)" },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(
      cambios.map((c: { id: number; columnaId: number; orden: number }) =>
        prisma.sistema_tarjeta.update({
          where: { id: c.id },
          data: { columnaId: c.columnaId, orden: c.orden },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/sistema/tarjetas/reorder", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
