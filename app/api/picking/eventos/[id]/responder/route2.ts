import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await req.json();
    const { estado, respuesta_nota } = body;

    if (!["pedido", "se"].includes(estado)) {
      return NextResponse.json(
        { error: "estado debe ser 'pedido' o 'se'" },
        { status: 400 }
      );
    }

    const evento = await prisma.picking_eventos.update({
      where: { id },
      data: {
        estado,
        respuesta_nota: respuesta_nota ?? null,
        respondido_en: new Date(),
      },
    });

    return NextResponse.json(evento);
  } catch (error) {
    console.error("PATCH /api/picking/eventos/[id]/responder", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
