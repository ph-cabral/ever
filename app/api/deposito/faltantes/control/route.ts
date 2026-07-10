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
        vendido: boolean | null;
        irrelevante: boolean | null;
        duplicado: boolean | null;
      }[]
    >`
      SELECT "nroPedOrigen",
             "nroRengOrigen",
             to_char("fechaArribo", 'YYYY-MM-DD') AS "fechaArribo",
             "clienteQuiere",
             "vendido",
             "irrelevante",
             "duplicado"
      FROM preparado.faltante_control
      WHERE fecha = ${fecha}::date
    `;
    return NextResponse.json({
      rows: rows.map((r) => ({
        nroPedOrigen: Number(r.nroPedOrigen),
        nroRengOrigen: Number(r.nroRengOrigen),
        fechaArribo: r.fechaArribo,
        clienteQuiere: r.clienteQuiere,
        vendido: r.vendido,
        irrelevante: r.irrelevante,
        duplicado: r.duplicado,
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
// { fecha, nroPedOrigen, nroRengOrigen, codArticulo, fechaArribo:string|null,
//   clienteQuiere:boolean|null, vendido?:boolean|null }
// `vendido` es OPCIONAL: si no viene en el body, NO se toca (lo usan
// /deposito/faltantes/control y /ventas/faltantes "Tabla 1" sin saber de él;
// solo /ventas/faltantes "Tabla 2" lo manda).
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
    const vendidoProvisto = Object.prototype.hasOwnProperty.call(b, "vendido");
    const vendido: boolean | null =
      b.vendido === null || b.vendido === undefined ? null : Boolean(b.vendido);
    // irrelevante: igual patrón opcional que vendido — solo se toca si viene
    // en el body (lo manda /ventas/faltantes, botón basurero "Tabla 1").
    const irrelevanteProvisto = Object.prototype.hasOwnProperty.call(b, "irrelevante");
    const irrelevante: boolean | null =
      b.irrelevante === null || b.irrelevante === undefined ? null : Boolean(b.irrelevante);
    // duplicado: igual patrón opcional que irrelevante (lo manda /ventas/faltantes,
    // botón "Duplicado" — factura duplicada, este renglón no es un faltante real).
    const duplicadoProvisto = Object.prototype.hasOwnProperty.call(b, "duplicado");
    const duplicado: boolean | null =
      b.duplicado === null || b.duplicado === undefined ? null : Boolean(b.duplicado);

    if (!fecha || !nroPedOrigen || !nroRengOrigen)
      return NextResponse.json(
        { ok: false, error: "datos incompletos" },
        { status: 400 },
      );

    await prisma.$executeRaw`
      INSERT INTO preparado.faltante_control AS fc
        (fecha, "nroPedOrigen", "nroRengOrigen", "codArticulo", "fechaArribo", "clienteQuiere", "vendido", "vendidoAt", "irrelevante", "irrelevanteAt", "duplicado", "duplicadoAt", "updatedAt")
      VALUES (
        ${fecha}::date, ${nroPedOrigen}, ${nroRengOrigen}, ${codArticulo}, ${fechaArribo}::date, ${clienteQuiere}::boolean,
        ${vendido}::boolean, ${vendidoProvisto ? new Date() : null},
        ${irrelevante}::boolean, ${irrelevanteProvisto ? new Date() : null},
        ${duplicado}::boolean, ${duplicadoProvisto ? new Date() : null}, now()
      )
      ON CONFLICT (fecha, "nroPedOrigen", "nroRengOrigen") DO UPDATE SET
        "fechaArribo"    = EXCLUDED."fechaArribo",
        "clienteQuiere"  = EXCLUDED."clienteQuiere",
        "codArticulo"    = EXCLUDED."codArticulo",
        "vendido"        = CASE WHEN ${vendidoProvisto} THEN EXCLUDED."vendido" ELSE fc."vendido" END,
        "vendidoAt"      = CASE WHEN ${vendidoProvisto} THEN now() ELSE fc."vendidoAt" END,
        "irrelevante"    = CASE WHEN ${irrelevanteProvisto} THEN EXCLUDED."irrelevante" ELSE fc."irrelevante" END,
        "irrelevanteAt"  = CASE WHEN ${irrelevanteProvisto} THEN now() ELSE fc."irrelevanteAt" END,
        "duplicado"      = CASE WHEN ${duplicadoProvisto} THEN EXCLUDED."duplicado" ELSE fc."duplicado" END,
        "duplicadoAt"    = CASE WHEN ${duplicadoProvisto} THEN now() ELSE fc."duplicadoAt" END,
        "updatedAt"      = now()
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
