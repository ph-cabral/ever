import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - listar mensajes no respondidos
export async function GET() {
  try {
    const mensajes = await prisma.chat_mensajes.findMany({
      where: { respondido: false },
      orderBy: { creado_en: "asc" },
    });
    return NextResponse.json(mensajes);
  } catch (error) {
    console.error("[chat GET]", error);
    return NextResponse.json({ error: "Error al obtener mensajes" }, { status: 500 });
  }
}

// POST - picker envía mensaje
export async function POST(req: Request) {
  try {
    const { picker_nombre, mensaje } = await req.json();
    if (!picker_nombre || !mensaje) {
      return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
    }
    const nuevo = await prisma.chat_mensajes.create({
      data: { picker_nombre, mensaje },
    });
    return NextResponse.json(nuevo, { status: 201 });
  } catch (error) {
    console.error("[chat POST]", error);
    return NextResponse.json({ error: "Error al guardar mensaje" }, { status: 500 });
  }
}


// PATCH - responder mensaje
export async function PATCH(req: Request) {
  try {
    const { id, respuesta } = await req.json();
    if (!id || !respuesta) {
      return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
    }
    const actualizado = await prisma.chat_mensajes.update({
      where: { id },
      data: { respuesta, respondido: true },
    });
    return NextResponse.json(actualizado);
  } catch (error) {
    console.error("[chat PATCH]", error);
    return NextResponse.json({ error: "Error al responder" }, { status: 500 });
  }
}

