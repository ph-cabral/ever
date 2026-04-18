import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — picker crea un evento
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { codigo, cantidad, picker_nombre } = body;

    if (!codigo || !cantidad || !picker_nombre) {
      return NextResponse.json(
        { error: "Faltan campos: codigo, cantidad, picker_nombre" },
        { status: 400 }
      );
    }

    const evento = await prisma.picking_eventos.create({
      data: {
        codigo: String(codigo),
        cantidad: Number(cantidad),
        picker_nombre: String(picker_nombre),
        estado: "pendiente",
      },
    });

    return NextResponse.json(evento, { status: 201 });
  } catch (error) {
    console.error("POST /api/picking/eventos", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// GET — depósito lista eventos (por defecto solo pendientes)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado") ?? "pendiente";
    const limit = Number(searchParams.get("limit") ?? "50");

    const eventos = await prisma.picking_eventos.findMany({
      where: estado === "todos" ? {} : { estado },
      orderBy: { creado_en: "desc" },
      take: limit,
    });

    return NextResponse.json(eventos);
  } catch (error) {
    console.error("GET /api/picking/eventos", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

