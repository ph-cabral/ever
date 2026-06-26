import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Catálogo de novedades (preparado.faltante_novedad_tipo). El front lo pide una vez
// en la primera carga: muestra el nombre y guarda el id. Raw SQL (la tabla se crea
// por DDL, ver prisma/sql/faltante_novedad.sql).
export async function GET() {
  try {
    const rows = await prisma.$queryRaw<{ id: number; nombre: string }[]>`
      SELECT id, nombre
      FROM preparado.faltante_novedad_tipo
      WHERE activo = true
      ORDER BY orden ASC, nombre ASC
    `;
    return NextResponse.json({
      tipos: rows.map((r) => ({ id: Number(r.id), nombre: r.nombre })),
    });
  } catch (error) {
    console.error("GET /api/deposito/faltantes/novedades", error);
    return NextResponse.json(
      { error: "Error al leer novedades" },
      { status: 500 },
    );
  }
}
