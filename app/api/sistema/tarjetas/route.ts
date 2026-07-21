import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — crear tarjeta en una columna
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
   const { columnaId, campos, tableroId } = body;
   if (!columnaId || !tableroId)
     return NextResponse.json(
       { error: "Falta columnaId/tableroId" },
       { status: 400 },
     );

    const max = await prisma.sistema_tarjeta.aggregate({
      where: { columnaId: Number(columnaId) },
      _max: { orden: true },
    });
    const orden = (max._max.orden ?? -1) + 1;

    const tarjeta = await prisma.$transaction(async (tx) => {
      const nueva = await tx.sistema_tarjeta.create({
        data: {
          columnaId: Number(columnaId),
          tableroId: Number(tableroId),
          orden,
          campos: campos ?? {},
        },
      });
      // Arranca el historial de columnas con la entrada inicial.
      await tx.sistema_columna_historial.create({
        data: {
          tarjetaId: nueva.id,
          columnaId: nueva.columnaId,
          entradaEn: nueva.columnaDesde,
        },
      });
      return nueva;
    });

    return NextResponse.json(tarjeta, { status: 201 });
  } catch (error) {
    console.error("POST /api/sistema/tarjetas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
