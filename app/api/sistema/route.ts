import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — todos los tableros con sus columnas y tarjetas, ordenados.
// Nota: se arma a mano con 3 queries (en vez de `include` por relación) porque el
// nombre de la relación generada por `prisma db pull` no está garantizado de antemano;
// las columnas escalares (tableroId, columnaId) sí están fijas por el DDL.
export async function GET() {
  try {
    const [tableros, columnas, ocultas, tarjetas] = await Promise.all([
      prisma.sistema_tablero.findMany({ orderBy: { id: "asc" } }),
      prisma.sistema_columna.findMany({ orderBy: { orden: "asc" } }),
      prisma.sistema_columna_oculta.findMany(),
      prisma.sistema_tarjeta.findMany({ orderBy: { orden: "asc" } }),
    ]);

    const result = tableros.map((t) => {
      const hidden = new Set(
        ocultas.filter((o) => o.tableroId === t.id).map((o) => o.columnaId),
      );
      const visibles = columnas.filter((c) => !hidden.has(c.id));
      // tarjetas que pertenecen a este tablero
      const propias = tarjetas.filter((tj) => tj.tableroId === t.id);
      return {
        ...t,
        columnasGlobales: columnas, // para el config de visibilidad
        ocultas: [...hidden],
        columnas: visibles.map((c) => {
          const propiasCol = propias.filter((tj) => tj.columnaId === c.id);
          const esResuelto = c.nombre.trim().toLowerCase() === "resuelto";
          const tarjetasCol = esResuelto
            ? [...propiasCol].sort((a, b) => {
                const fa = new Date(
                  ((a.campos as Record<string, unknown>)?.fecha as string) ?? a.createdAt,
                ).getTime();
                const fb = new Date(
                  ((b.campos as Record<string, unknown>)?.fecha as string) ?? b.createdAt,
                ).getTime();
                return fb - fa; // más nuevas arriba
              })
            : propiasCol;
          return {
            ...c,
            tableroId: t.id,
            tarjetas: tarjetasCol,
          };
        }),
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/sistema", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
