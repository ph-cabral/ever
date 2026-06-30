import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH — editar campos y/o mover de columna
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tarjetaId = Number(id);
    if (isNaN(tarjetaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await req.json();
    const { campos, columnaId, orden, vinculadoTableroId } = body;

    const data: Record<string, unknown> = {};
    if (campos !== undefined) data.campos = campos;
    if (columnaId !== undefined) data.columnaId = Number(columnaId);
    if (orden !== undefined) data.orden = Number(orden);
    if (vinculadoTableroId !== undefined)
      data.vinculadoTableroId =
        vinculadoTableroId === null ? null : Number(vinculadoTableroId);

    const tarjeta = await prisma.sistema_tarjeta.update({
      where: { id: tarjetaId },
      data,
    });

    return NextResponse.json(tarjeta);
  } catch (error) {
    console.error("PATCH /api/sistema/tarjetas/[id]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE — borrar tarjeta
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tarjetaId = Number(id);
    if (isNaN(tarjetaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    await prisma.sistema_tarjeta.delete({ where: { id: tarjetaId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/sistema/tarjetas/[id]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
