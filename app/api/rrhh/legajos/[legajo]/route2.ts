import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ legajo: string }> },
) {
  const { legajo: codigo } = await params;
  try {
    const data = await prisma.legajo.findUnique({
      where: { codigo },
      include: {
        familiares: true,
        beneficiarios: true,
        estudios: true,
        idiomas: true,
        equipos: true,
        antecedentesSrt: true,
      },
    });
    if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET legajo error:", e);
    return NextResponse.json({ error: "Error al obtener legajo" }, { status: 500 });
  }
}
