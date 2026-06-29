import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — todos los tableros con sus columnas y tarjetas, ordenados.
// Nota: se arma a mano con 3 queries (en vez de `include` por relación) porque el
// nombre de la relación generada por `prisma db pull` no está garantizado de antemano;
// las columnas escalares (tableroId, columnaId) sí están fijas por el DDL.
export async function GET() {
  try {
    const [tableros, columnas, tarjetas] = await Promise.all([
      prisma.sistema_tablero.findMany({ orderBy: { id: "asc" } }),
      prisma.sistema_columna.findMany({ orderBy: { orden: "asc" } }),
      prisma.sistema_tarjeta.findMany({ orderBy: { orden: "asc" } }),
    ]);

    const result = tableros.map((t) => ({
      ...t,
      columnas: columnas
        .filter((c) => c.tableroId === t.id)
        .map((c) => ({
          ...c,
          tarjetas: tarjetas.filter((tj) => tj.columnaId === c.id),
        })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/sistema", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
