import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const ranking = await prisma.$queryRaw`
      SELECT
        c.codigo,
        COUNT(c.id)::int as cantidad_cortes,
        COALESCE(SUM(c.metros), 0)::float as total_metros
      FROM fabrica.corte c
      GROUP BY c.codigo
      ORDER BY total_metros DESC
    `;

    return NextResponse.json(ranking);
  } catch (error) {
    console.error("Error ranking cortes:", error);
    return NextResponse.json({ error: "Error al obtener ranking" }, { status: 500 });
  }
}
