import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { crearCasoSoftech } from "@/lib/softech-jira";

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

    let tarjeta = await prisma.$transaction(async (tx) => {
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

    // Softech: además de la tarjeta, se abre el caso en el portal de soporte
    // (Jira Service Management) y se guarda el link para tener vinculación.
    // "Problema" -> resumen, "Acción / nota" -> descripción; el resto de los
    // campos del tablero se ignora para esto. Si falla, la tarjeta ya creada
    // queda sin link (no se rompe la creación).
    const tablero = await prisma.sistema_tablero.findUnique({
      where: { id: Number(tableroId) },
      select: { clave: true },
    });
    if (tablero?.clave === "softech") {
      const camposActuales = (tarjeta.campos ?? {}) as Record<string, unknown>;
      const caso = await crearCasoSoftech({
        sistema: camposActuales.sistema as string | null | undefined,
        resumen: camposActuales.problema as string | null | undefined,
        descripcion: camposActuales.accion as string | null | undefined,
      });
      if (caso) {
        tarjeta = await prisma.sistema_tarjeta.update({
          where: { id: tarjeta.id },
          data: {
            campos: { ...camposActuales, jiraKey: caso.issueKey, jiraUrl: caso.url },
          },
        });
      }
    }

    return NextResponse.json(tarjeta, { status: 201 });
  } catch (error) {
    console.error("POST /api/sistema/tarjetas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
