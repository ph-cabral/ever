import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Novedad por renglón faltante (preparado.faltante_novedad). Guarda el id del
// catálogo (faltante_novedad_tipo), no el texto. Clave (fecha, ped, reng).
// Raw SQL: la tabla se crea por DDL (ver prisma/sql/faltante_novedad.sql).

// GET ?fecha=YYYY-MM-DD → novedades ya elegidas ese día (para retomar).
export async function GET(req: NextRequest) {
  const fecha = new URL(req.url).searchParams.get("fecha");
  if (!fecha)
    return NextResponse.json({ error: "fecha requerida" }, { status: 400 });
  try {
    const rows = await prisma.$queryRaw<
      {
        nroPedOrigen: number;
        nroRengOrigen: number;
        novedadId: number | null;
      }[]
    >`
      SELECT "nroPedOrigen", "nroRengOrigen", "novedadId"
      FROM preparado.faltante_novedad
      WHERE fecha = ${fecha}::date
    `;
    return NextResponse.json({
      rows: rows.map((r) => ({
        nroPedOrigen: Number(r.nroPedOrigen),
        nroRengOrigen: Number(r.nroRengOrigen),
        novedadId: r.novedadId == null ? null : Number(r.novedadId),
      })),
    });
  } catch (error) {
    console.error("GET /api/deposito/faltantes/novedad", error);
    return NextResponse.json(
      { error: "Error al leer novedades" },
      { status: 500 },
    );
  }
}

// POST → guarda/actualiza la novedad de un renglón. Body:
// { fecha, nroPedOrigen, nroRengOrigen, codArticulo, novedadId:number|null }
// novedadId null = "sin novedad" (limpia la fila).
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const fecha: string = b.fecha;
    const nroPedOrigen = Number(b.nroPedOrigen);
    const nroRengOrigen = Number(b.nroRengOrigen);
    const codArticulo = String(b.codArticulo ?? "");
    const novedadId: number | null =
      b.novedadId === null || b.novedadId === undefined || b.novedadId === ""
        ? null
        : Number(b.novedadId);

    if (!fecha || !nroPedOrigen || !nroRengOrigen)
      return NextResponse.json(
        { ok: false, error: "datos incompletos" },
        { status: 400 },
      );

    // Sin novedad → borro la fila para no dejar registros vacíos.
    if (novedadId == null) {
      await prisma.$executeRaw`
        DELETE FROM preparado.faltante_novedad
        WHERE fecha = ${fecha}::date
          AND "nroPedOrigen" = ${nroPedOrigen}
          AND "nroRengOrigen" = ${nroRengOrigen}
      `;
      return NextResponse.json({ ok: true, deleted: true });
    }

    await prisma.$executeRaw`
      INSERT INTO preparado.faltante_novedad
        (fecha, "nroPedOrigen", "nroRengOrigen", "codArticulo", "novedadId", "updatedAt")
      VALUES (${fecha}::date, ${nroPedOrigen}, ${nroRengOrigen}, ${codArticulo}, ${novedadId}, now())
      ON CONFLICT (fecha, "nroPedOrigen", "nroRengOrigen") DO UPDATE SET
        "novedadId"   = EXCLUDED."novedadId",
        "codArticulo" = EXCLUDED."codArticulo",
        "updatedAt"   = now()
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/deposito/faltantes/novedad", error);
    return NextResponse.json(
      { ok: false, error: "Error al guardar" },
      { status: 500 },
    );
  }
}
