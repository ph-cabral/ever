import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { clave, nombre } = await req.json();
    if (!clave?.trim() || !nombre?.trim())
      return NextResponse.json(
        { error: "Falta clave/nombre" },
        { status: 400 },
      );
    const t = await prisma.sistema_tablero.create({
      data: { clave: clave.trim(), nombre: nombre.trim() },
    });
    return NextResponse.json(t, { status: 201 });
  } catch (e) {
    console.error("POST /api/sistema/tableros", e);
    return NextResponse.json(
      { error: "Error interno (¿clave repetida?)" },
      { status: 500 },
    );
  }
}
