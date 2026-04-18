import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const count = await prisma.picking_eventos.count({
      where: { estado: "pendiente" },
    });

    return NextResponse.json({ pendientes: count, ok: true });
  } catch (error) {
    console.error("GET /api/picking/estado", error);
    return NextResponse.json({ pendientes: 0, ok: false }, { status: 500 });
  }
}
