import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET ?fecha=YYYY-MM-DD → marcas ya guardadas de ese día (para retomar).
export async function GET(req: NextRequest) {
  const fecha = new URL(req.url).searchParams.get("fecha");
  if (!fecha)
    return NextResponse.json({ error: "fecha requerida" }, { status: 400 });
  try {
    const rows = await prisma.faltante_existencia.findMany({
      where: { fecha: new Date(fecha) },
      select: {
        nroPedOrigen: true,
        nroRengOrigen: true,
        codArticulo: true,
        existencia: true,
        malFacturado: true,
        cantidad: true,
      },
    });
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("GET /api/deposito/faltantes/check", error);
    return NextResponse.json({ error: "Error al leer marcas" }, { status: 500 });
  }
}

// POST → guarda/actualiza una marca y/o la cantidad. Body:
// { fecha, nroPedOrigen, nroRengOrigen, codArticulo,
//   existencia?:boolean|null, malFacturado?:boolean, cantidad?:number|null }
// existencia, malFacturado y cantidad son independientes: se puede mandar sólo
// uno (ej. tipear la cantidad sin haber marcado todavía el estado). El front
// (page.tsx) trata las 3 marcas (si/no/mal facturado) como excluyentes y
// siempre manda existencia+malFacturado juntos al marcar una de ellas:
//   "si"  → { existencia: true,  malFacturado: false }
//   "no"  → { existencia: false, malFacturado: false }
//   "mal" → { existencia: null,  malFacturado: true  }
// Por eso alcanza con "si la clave vino en el body, pisar esa columna" — sin
// lógica de exclusión mutua acá.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const fecha = new Date(b.fecha);
    const tieneExistencia =
      typeof b.existencia === "boolean" || b.existencia === null;
    const tieneMalFacturado = typeof b.malFacturado === "boolean";
    const tieneCantidad = b.cantidad !== undefined;
    const row = await prisma.faltante_existencia.upsert({
      where: {
        uniq_faltante: {
          fecha,
          nroPedOrigen: b.nroPedOrigen,
          nroRengOrigen: b.nroRengOrigen,
        },
      },
      update: {
        ...(tieneExistencia ? { existencia: b.existencia } : {}),
        ...(tieneMalFacturado ? { malFacturado: b.malFacturado } : {}),
        ...(tieneCantidad
          ? { cantidad: b.cantidad === null ? null : Number(b.cantidad) }
          : {}),
        codArticulo: String(b.codArticulo ?? ""),
      },
      create: {
        fecha,
        nroPedOrigen: b.nroPedOrigen,
        nroRengOrigen: b.nroRengOrigen,
        codArticulo: String(b.codArticulo ?? ""),
        existencia: tieneExistencia ? b.existencia : null,
        malFacturado: tieneMalFacturado ? b.malFacturado : null,
        cantidad: tieneCantidad
          ? b.cantidad === null
            ? null
            : Number(b.cantidad)
          : null,
      },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (error) {
    console.error("POST /api/deposito/faltantes/check", error);
    return NextResponse.json(
      { ok: false, error: "Error al guardar" },
      { status: 500 },
    );
  }
}

// DELETE → deshacer una marca. Body: { fecha, nroPedOrigen, nroRengOrigen }
export async function DELETE(req: NextRequest) {
  try {
    const b = await req.json();
    await prisma.faltante_existencia.deleteMany({
      where: {
        fecha: new Date(b.fecha),
        nroPedOrigen: b.nroPedOrigen,
        nroRengOrigen: b.nroRengOrigen,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/deposito/faltantes/check", error);
    return NextResponse.json(
      { ok: false, error: "Error al deshacer" },
      { status: 500 },
    );
  }
}
