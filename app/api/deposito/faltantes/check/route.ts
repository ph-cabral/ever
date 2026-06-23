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
      },
    });
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("GET /api/deposito/faltantes/check", error);
    return NextResponse.json({ error: "Error al leer marcas" }, { status: 500 });
  }
}

// POST → guarda/actualiza una marca. Body:
// { fecha, nroPedOrigen, nroRengOrigen, codArticulo, existencia:boolean }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const fecha = new Date(b.fecha);
    const row = await prisma.faltante_existencia.upsert({
      where: {
        uniq_faltante: {
          fecha,
          nroPedOrigen: b.nroPedOrigen,
          nroRengOrigen: b.nroRengOrigen,
        },
      },
      update: {
        existencia: b.existencia,
        codArticulo: String(b.codArticulo ?? ""),
      },
      create: {
        fecha,
        nroPedOrigen: b.nroPedOrigen,
        nroRengOrigen: b.nroRengOrigen,
        codArticulo: String(b.codArticulo ?? ""),
        existencia: b.existencia,
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
