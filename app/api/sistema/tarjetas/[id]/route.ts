import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
// Columnas "abiertas" del tablero Softech: mientras la tarjeta esté en alguna de estas,
// el problema sigue sin cerrar. Cualquier otra columna (Solucionado, Sin solución,
// Parcial / sin solución, o las que se agreguen después) se toma como cierre y
// dispara campos.fin automáticamente — ver también el mismo helper en
// tarjetas/reorder/route.ts (el path real del drag&drop).
const SOFTECH_COLUMNAS_ABIERTAS = ["pendiente", "en espera"];
function esColumnaAbiertaSoftech(nombre: string) {
  return SOFTECH_COLUMNAS_ABIERTAS.includes(normalizar(nombre));
}

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
    const { campos, columnaId, orden, tableroId } = body;

    const data: Record<string, unknown> = {};
    let historialColumnaId: number | null = null;

    if (columnaId !== undefined) {
      const nuevaColumnaId = Number(columnaId);
      data.columnaId = nuevaColumnaId;

      const actual = await prisma.sistema_tarjeta.findUnique({
        where: { id: tarjetaId },
        select: {
          columnaId: true,
          campos: true,
          tablero: { select: { clave: true } },
        },
      });

      if (actual && actual.columnaId !== nuevaColumnaId) {
        // Cambió de columna de verdad: marcar la entrada (se usa para autoordenar
        // las columnas sin orden manual por fecha de entrada, no de creación) y
        // dejar registro en el historial completo.
        data.columnaDesde = new Date();
        historialColumnaId = nuevaColumnaId;

        // Softech: "fin" se completa/limpia solo según si la columna destino es de
        // cierre o no — ya no se pide a mano en el formulario.
        if (actual.tablero?.clave === "softech") {
          const nuevaColumna = await prisma.sistema_columna.findUnique({
            where: { id: nuevaColumnaId },
            select: { nombre: true },
          });
          if (nuevaColumna) {
            const base = (campos !== undefined ? campos : actual.campos) as Record<string, unknown>;
            data.campos = {
              ...base,
              fin: esColumnaAbiertaSoftech(nuevaColumna.nombre) ? null : new Date().toISOString(),
            };
          }
        }
      }
    }
    if (campos !== undefined && data.campos === undefined) data.campos = campos;
    if (orden !== undefined) data.orden = Number(orden);
    if (tableroId !== undefined) data.tableroId = Number(tableroId);

    const tarjeta = await prisma.$transaction(async (tx) => {
      const actualizada = await tx.sistema_tarjeta.update({
        where: { id: tarjetaId },
        data,
      });
      if (historialColumnaId !== null) {
        await tx.sistema_columna_historial.create({
          data: {
            tarjetaId,
            columnaId: historialColumnaId,
            entradaEn: actualizada.columnaDesde,
          },
        });
      }
      return actualizada;
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
