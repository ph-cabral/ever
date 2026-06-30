import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH — renombrar columna
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const columnaId = Number(id);
    if (isNaN(columnaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await req.json();
    const { nombre } = body;
    if (!nombre || !String(nombre).trim()) {
      return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
    }

    const columna = await prisma.sistema_columna.update({
      where: { id: columnaId },
      data: { nombre: String(nombre).trim() },
    });

    return NextResponse.json(columna);
  } catch (error) {
    console.error("PATCH /api/sistema/columnas/[id]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE — borrar columna; las tarjetas se reasignan a otra columna del mismo tablero
// (la primera por orden, distinta de la borrada). Si no queda ninguna otra, se rechaza.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const columnaId = Number(id);
    if (isNaN(columnaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const columna = await prisma.sistema_columna.findUnique({ where: { id: columnaId } });
    if (!columna) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    // columnas son globales: reasignar a cualquier otra columna
    const otras = await prisma.sistema_columna.findMany({
      where: { id: { not: columnaId } },
      orderBy: { orden: "asc" },
    });

    const tarjetasEnColumna = await prisma.sistema_tarjeta.count({ where: { columnaId } });

    if (tarjetasEnColumna > 0 && otras.length === 0) {
      return NextResponse.json(
        { error: "No se puede borrar la única columna del tablero mientras tenga tarjetas" },
        { status: 400 }
      );
    }

    if (tarjetasEnColumna > 0) {
      const destino = otras[0];
      const max = await prisma.sistema_tarjeta.aggregate({
        where: { columnaId: destino.id },
        _max: { orden: true },
      });
      let orden = (max._max.orden ?? -1) + 1;
      const tarjetas = await prisma.sistema_tarjeta.findMany({
        where: { columnaId },
        orderBy: { orden: "asc" },
      });
      for (const t of tarjetas) {
        await prisma.sistema_tarjeta.update({
          where: { id: t.id },
          data: { columnaId: destino.id, orden: orden++ },
        });
      }
    }

    await prisma.sistema_columna.delete({ where: { id: columnaId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/sistema/columnas/[id]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
