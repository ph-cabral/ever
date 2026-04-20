import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { respuesta } = await req.json();
    if (!respuesta) {
      return NextResponse.json({ error: "Falta respuesta" }, { status: 400 });
    }

    const actualizado = await prisma.chat_mensajes.update({
      where: { id: Number(id) },
      data: { respuesta, respondido: true },
    });

    const topic = `everwear-picking-${actualizado.picker_nombre
      .toLowerCase()
      .replace(/\s+/g, "-")}`;

    try {
      await fetch(`https://ntfy.sh/${topic}`, {
        method: "POST",
        headers: {
          Title: "Nuevo mensaje",
          Priority: "default",
          Tags: "speech_balloon",
          "Content-Type": "text/plain",
        },
        // body: respuesta,
        // body: `${actualizado.picker_nombre}: ${actualizado.mensaje}\n\nGerencia: ${respuesta}`,
        body: `YO: ${actualizado.mensaje}\nGerencia: ${respuesta}`,
      });
    } catch (ntfyError) {
      console.warn("ntfy error (no crítico):", ntfyError);
    }

    return NextResponse.json(actualizado);
  } catch (error) {
    console.error("[chat PATCH]", error);
    return NextResponse.json({ error: "Error al responder" }, { status: 500 });
  }
}
