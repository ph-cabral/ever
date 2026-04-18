// app/api/reportes/ranking-cortes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    let ranking;

    if (desde && hasta) {
      const fechaDesde = new Date(`${desde}T00:00:00-03:00`);
      const fechaHasta = new Date(`${hasta}T23:59:59-03:00`);
      ranking = await prisma.$queryRaw`SELECT c.codigo, COUNT(c.id)::int as cantidad_cortes, COALESCE(SUM(c.metros), 0)::float as total_metros FROM fabrica.corte c WHERE c.fecha >= ${fechaDesde} AND c.fecha <= ${fechaHasta} GROUP BY c.codigo ORDER BY total_metros DESC`;
    } else if (desde) {
      const fechaDesde = new Date(`${desde}T00:00:00-03:00`);
      const fechaHasta = new Date(`${desde}T23:59:59-03:00`);
      ranking = await prisma.$queryRaw`SELECT c.codigo, COUNT(c.id)::int as cantidad_cortes, COALESCE(SUM(c.metros), 0)::float as total_metros FROM fabrica.corte c WHERE c.fecha >= ${fechaDesde} AND c.fecha <= ${fechaHasta} GROUP BY c.codigo ORDER BY total_metros DESC`;
    } else {
      ranking = await prisma.$queryRaw`SELECT c.codigo, COUNT(c.id)::int as cantidad_cortes, COALESCE(SUM(c.metros), 0)::float as total_metros FROM fabrica.corte c GROUP BY c.codigo ORDER BY total_metros DESC`;
    }

    return NextResponse.json(ranking);
  } catch (error) {
    console.error("Error ranking cortes:", error);
    return NextResponse.json({ error: "Error al obtener ranking" }, { status: 500 });
  }
}

