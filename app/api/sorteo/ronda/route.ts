import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRondaActiva, conSector, claveOk } from "@/lib/sorteo";

// GET: ronda activa (plan de instancias + álbum de ganadores). Crea una si no hay.
export async function GET() {
  try {
    const ronda = await getRondaActiva(prisma, true);
    if (!ronda)
      return NextResponse.json(
        { ok: false, ronda: null, album: [] },
        { status: 500 },
      );
    const albumRaw = await prisma.sorteo_album.findMany({
      where: { rondaId: ronda.id },
      orderBy: { orden: "asc" },
    });
    const album = await conSector(prisma, albumRaw);
    return NextResponse.json({
      ok: true,
      ronda: {
        id: ronda.id,
        estado: ronda.estado,
        instancias: ronda.instancias ?? [],
      },
      album,
    });
  } catch (e) {
    console.error("GET /api/sorteo/ronda", e);
    return NextResponse.json(
      { ok: false, ronda: null, album: [] },
      { status: 500 },
    );
  }
}

// POST: guarda el plan de instancias en la ronda activa.
// body: { instancias: [{ orden, premios: [{ file, nombre }] }] }   (mejor→peor)
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const instancias = Array.isArray(b.instancias) ? b.instancias : [];
  try {
    const ronda = await getRondaActiva(prisma, true);
    if (!ronda)
      return NextResponse.json({ ok: false, msg: "Error" }, { status: 500 });
    const yaCargados = await prisma.sorteo_album.count({
      where: { rondaId: ronda.id },
    });
    if (yaCargados > 0) {
      return NextResponse.json(
        {
          ok: false,
          msg: "La ronda ya tiene ganadores. Creá un nuevo sorteo para rearmar.",
        },
        { status: 409 },
      );
    }
    const upd = await prisma.sorteo_ronda.update({
      where: { id: ronda.id },
      data: { instancias },
    });
    return NextResponse.json({
      ok: true,
      ronda: {
        id: upd.id,
        estado: upd.estado,
        instancias: upd.instancias ?? [],
      },
    });
  } catch (e) {
    console.error("POST /api/sorteo/ronda", e);
    return NextResponse.json({ ok: false, msg: "Error" }, { status: 500 });
  }
}

// PATCH: ciclo de vida. body: { accion: "nuevo", clave }
// "nuevo" → cierra la ronda activa (queda como historial) y crea una nueva vacía.
export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const accion = String(b.accion ?? "");
  const clave = String(b.clave ?? "");
  if (!claveOk(clave))
    return NextResponse.json(
      { ok: false, msg: "No autorizado" },
      { status: 401 },
    );
  try {
    if (accion === "nuevo") {
      const nueva = await prisma.$transaction(async (tx) => {
        const act = await getRondaActiva(tx, false);
        if (act)
          await tx.sorteo_ronda.update({
            where: { id: act.id },
            data: { estado: "cerrado" },
          });
        return tx.sorteo_ronda.create({ data: {} });
      });
      return NextResponse.json({
        ok: true,
        ronda: { id: nueva.id, estado: nueva.estado, instancias: [] },
      });
    }
    return NextResponse.json(
      { ok: false, msg: "Acción inválida" },
      { status: 400 },
    );
  } catch (e) {
    console.error("PATCH /api/sorteo/ronda", e);
    return NextResponse.json({ ok: false, msg: "Error" }, { status: 500 });
  }
}

// DELETE: vacía SOLO los ganadores de la ronda activa (para pruebas). Requiere clave.
export async function DELETE(req: Request) {
  const b = await req.json().catch(() => ({}));
  const clave = String(b.clave ?? "");
  if (!claveOk(clave))
    return NextResponse.json(
      { ok: false, msg: "No autorizado" },
      { status: 401 },
    );
  try {
    const ronda = await getRondaActiva(prisma, false);
    if (ronda) {
      await prisma.sorteo_album.deleteMany({ where: { rondaId: ronda.id } });
      if (ronda.estado !== "armado")
        await prisma.sorteo_ronda.update({
          where: { id: ronda.id },
          data: { estado: "armado" },
        });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/sorteo/ronda", e);
    return NextResponse.json({ ok: false, msg: "Error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
