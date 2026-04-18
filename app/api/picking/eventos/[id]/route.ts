// import { NextRequest, NextResponse } from "next/server";
// import { prisma } from "@/lib/prisma";

// export async function PATCH(
//   req: NextRequest,
//   { params }: { params: Promise<{ id: string }> }
// ) {
//   try {
//     const { id } = await params;
//     const eventoId = Number(id);
//     const body = await req.json();
//     const { estado, respuesta_nota } = body;

//     if (!["pedido", "se"].includes(estado)) {
//       return NextResponse.json(
//         { error: "estado debe ser 'pedido' o 'se'" },
//         { status: 400 }
//       );
//     }

//     const evento = await prisma.picking_eventos.update({
//       where: { id: eventoId },
//       data: {
//         estado,
//         respuesta_nota: respuesta_nota ?? null,
//         respondido_en: new Date(),
//       },
//     });

//     return NextResponse.json(evento);
//   } catch (error) {
//     console.error("PATCH /api/picking/eventos/[id]/responder", error);
//     return NextResponse.json({ error: "Error interno" }, { status: 500 });
//   }
// }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventoId = Number(id);
    if (isNaN(eventoId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const evento = await prisma.picking_eventos.findUnique({
      where: { id: eventoId },
    });

    if (!evento) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    return NextResponse.json(evento);
  } catch (error) {
    console.error("GET /api/picking/eventos/[id]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventoId = Number(id);
    const body = await req.json();
    const { estado, respuesta_nota } = body;

    if (!["pedido", "se"].includes(estado)) {
      return NextResponse.json(
        { error: "estado debe ser 'pedido' o 'se'" },
        { status: 400 }
      );
    }

    const evento = await prisma.picking_eventos.update({
      where: { id: eventoId },
      data: {
        estado,
        respuesta_nota: respuesta_nota ?? null,
        respondido_en: new Date(),
      },
    });

    return NextResponse.json(evento);
  } catch (error) {
    console.error("PATCH /api/picking/eventos/[id]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
