import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH — reordenar columnas de un tablero. body: { orden: [id1, id2, ...] }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { orden } = body;

    if (!Array.isArray(orden) || orden.some((x) => typeof x !== "number")) {
      return NextResponse.json({ error: "orden debe ser number[]" }, { status: 400 });
    }

    await prisma.$transaction(
      orden.map((id: number, idx: number) =>
        prisma.sistema_columna.update({ where: { id }, data: { orden: idx } })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/sistema/columnas/reorder", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
