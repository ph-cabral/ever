import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
// Mismo criterio que en tarjetas/[id]/route.ts: columnas "abiertas" de Softech.
// Cualquier otra columna se toma como cierre y dispara campos.fin automáticamente.
// Este es el endpoint que realmente usa el drag&drop del tablero.
const SOFTECH_COLUMNAS_ABIERTAS = ["pendiente", "en espera"];
function esColumnaAbiertaSoftech(nombre: string) {
  return SOFTECH_COLUMNAS_ABIERTAS.includes(normalizar(nombre));
}

// PATCH — mover/reordenar tarjetas, dentro de una columna o entre columnas.
// body: { cambios: [{ id, columnaId, orden }, ...] }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { cambios } = body;

    if (!Array.isArray(cambios) || cambios.length === 0) {
      return NextResponse.json({ error: "cambios debe ser un array no vacío" }, { status: 400 });
    }
    for (const c of cambios) {
      if (typeof c.id !== "number" || typeof c.columnaId !== "number" || typeof c.orden !== "number") {
        return NextResponse.json(
          { error: "cada cambio requiere id, columnaId, orden (number)" },
          { status: 400 }
        );
      }
    }

    // Para saber qué tarjetas realmente CAMBIAN de columna (y no solo se reordenan
    // dentro de la misma), comparamos contra el columnaId actual en la base: solo esas
    // actualizan columnaDesde (fecha de entrada usada para autoordenar columnas sin
    // orden manual), dejan registro en el historial completo y, en Softech, disparan
    // el campo "fin" automático.
    const cambiosTipados = cambios as { id: number; columnaId: number; orden: number }[];
    const actuales = await prisma.sistema_tarjeta.findMany({
      where: { id: { in: cambiosTipados.map((c) => c.id) } },
      select: { id: true, columnaId: true, campos: true, tablero: { select: { clave: true } } },
    });
    const actualPorId = new Map(actuales.map((t) => [t.id, t]));

    const cambiosDeColumna = cambiosTipados.filter((c) => actualPorId.get(c.id)?.columnaId !== c.columnaId);
    const columnaIdsDestino = Array.from(new Set(cambiosDeColumna.map((c) => c.columnaId)));
    const columnasDestino = columnaIdsDestino.length
      ? await prisma.sistema_columna.findMany({
          where: { id: { in: columnaIdsDestino } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombrePorColumnaId = new Map(columnasDestino.map((c) => [c.id, c.nombre]));

    const ahora = new Date();

    await prisma.$transaction([
      ...cambiosTipados.map((c) => {
        const actual = actualPorId.get(c.id);
        const cambioColumna = actual?.columnaId !== c.columnaId;
        const data: Record<string, unknown> = { columnaId: c.columnaId, orden: c.orden };
        if (cambioColumna) {
          data.columnaDesde = ahora;
          if (actual?.tablero?.clave === "softech") {
            const nombreDestino = nombrePorColumnaId.get(c.columnaId);
            if (nombreDestino) {
              const base = (actual.campos ?? {}) as Record<string, unknown>;
              data.campos = {
                ...base,
                fin: esColumnaAbiertaSoftech(nombreDestino) ? null : ahora.toISOString(),
              };
            }
          }
        }
        return prisma.sistema_tarjeta.update({ where: { id: c.id }, data });
      }),
      ...cambiosDeColumna.map((c) =>
        prisma.sistema_columna_historial.create({
          data: { tarjetaId: c.id, columnaId: c.columnaId, entradaEn: ahora },
        })
      ),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/sistema/tarjetas/reorder", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
