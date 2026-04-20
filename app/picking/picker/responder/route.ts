import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { respuesta } = await req.json();
    if (!respuesta) {
      return NextResponse.json({ error: "Falta respuesta" }, { status: 400 });
    }
    const actualizado = await prisma.chat_mensajes.update({
      where: { id: Number(params.id) },
      data: { respuesta, respondido: true },
    });
    return NextResponse.json(actualizado);
  } catch (error) {
    console.error("[chat PATCH]", error);
    return NextResponse.json({ error: "Error al responder" }, { status: 500 });
  }
}

