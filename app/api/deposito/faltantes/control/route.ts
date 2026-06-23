import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Control de faltantes "sin existencia": fecha de arribo + si el cliente lo quiere,
// por renglón. Persiste en preparado.faltante_control (raw SQL: la tabla se crea por
// DDL y se incorpora con `prisma db pull`).

// GET ?fecha=YYYY-MM-DD → control ya cargado de ese día (para retomar).
export async function GET(req: NextRequest) {
  const fecha = new URL(req.url).searchParams.get("fecha");
  if (!fecha)
    return NextResponse.json({ error: "fecha requerida" }, { status: 400 });
  try {
    const rows = await prisma.$queryRaw<
      {
        nroPedOrigen: number;
        nroRengOrigen: number;
        fechaArribo: string | null;
        clienteQuiere: boolean | null;
      }[]
    >`
      SELECT "nroPedOrigen",
             "nroRengOrigen",
             to_char("fechaArribo", 'YYYY-MM-DD') AS "fechaArribo",
             "clienteQuiere"
      FROM preparado.faltante_control
      WHERE fecha = ${fecha}::date
    `;
    return NextResponse.json({
      rows: rows.map((r) => ({
        nroPedOrigen: Number(r.nroPedOrigen),
        nroRengOrigen: Number(r.nroRengOrigen),
        fechaArribo: r.fechaArribo,
        clienteQuiere: r.clienteQuiere,
      })),
    });
  } catch (error) {
    console.error("GET /api/deposito/faltantes/control", error);
    return NextResponse.json(
      { error: "Error al leer control" },
      { status: 500 },
    );
  }
}

// POST → guarda/actualiza un renglón. Body:
// { fecha, nroPedOrigen, nroRengOrigen, codArticulo, fechaArribo:string|null, clienteQuiere:boolean|null }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const fecha: string = b.fecha;
    const nroPedOrigen = Number(b.nroPedOrigen);
    const nroRengOrigen = Number(b.nroRengOrigen);
    const codArticulo = String(b.codArticulo ?? "");
    const fechaArribo: string | null = b.fechaArribo || null;
    const clienteQuiere: boolean | null =
      b.clienteQuiere === null || b.clienteQuiere === undefined
        ? null
        : Boolean(b.clienteQuiere);

    if (!fecha || !nroPedOrigen || !nroRengOrigen)
      return NextResponse.json(
        { ok: false, error: "datos incompletos" },
        { status: 400 },
      );

    await prisma.$executeRaw`
      INSERT INTO preparado.faltante_control
        (fecha, "nroPedOrigen", "nroRengOrigen", "codArticulo", "fechaArribo", "clienteQuiere", "updatedAt")
      VALUES (${fecha}::date, ${nroPedOrigen}, ${nroRengOrigen}, ${codArticulo}, ${fechaArribo}::date, ${clienteQuiere}::boolean, now())
      ON CONFLICT (fecha, "nroPedOrigen", "nroRengOrigen") DO UPDATE SET
        "fechaArribo"   = EXCLUDED."fechaArribo",
        "clienteQuiere" = EXCLUDED."clienteQuiere",
        "codArticulo"   = EXCLUDED."codArticulo",
        "updatedAt"     = now()
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/deposito/faltantes/control", error);
    return NextResponse.json(
      { ok: false, error: "Error al guardar" },
      { status: 500 },
    );
  }
}
