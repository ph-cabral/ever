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

    if (!["pedido", "s/e"].includes(estado)) {
      return NextResponse.json(
        { error: "estado debe ser 'pedido' o 's/e'" },
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

    // Notificación ntfy al picker
    const topic = `everwear-picking-${evento.picker_nombre
      .toLowerCase()
      .replace(/\s+/g, "-")}`;
    
    console.log(topic)
    const esOk = estado === "pedido";
    const titulo = esOk ? "Pedido confirmado" : "Sin existencia";
    const cuerpo = respuesta_nota
      ? `${evento.codigo} x${evento.cantidad} — ${respuesta_nota}`
      : `${evento.codigo} x${evento.cantidad}`;

    try {
      await fetch(`https://ntfy.sh/${topic}`, {
        method: "POST",
        headers: {
          Title: titulo,
          Priority: esOk ? "default" : "high",
          Tags: esOk ? "white_check_mark" : "x",
          "Content-Type": "text/plain",
        },
        body: cuerpo,
      });
    } catch (ntfyError) {
      // No rompe el flujo si ntfy falla
      console.warn("ntfy error (no crítico):", ntfyError);
    }

    return NextResponse.json(evento);
  } catch (error) {
    console.error("PATCH /api/picking/eventos/[id]/responder", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

