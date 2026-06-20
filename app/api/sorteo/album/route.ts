import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRondaActiva, conSector, claveOk, MAX_ALBUM } from "@/lib/sorteo";

// GET: álbum de la ronda activa (ordenado 1..10, + sector).
export async function GET() {
  try {
    const ronda = await getRondaActiva(prisma, false);
    if (!ronda) return NextResponse.json({ ok: true, album: [] });
    const albumRaw = await prisma.sorteo_album.findMany({
      where: { rondaId: ronda.id },
      orderBy: { orden: "asc" },
    });
    return NextResponse.json({
      ok: true,
      album: await conSector(prisma, albumRaw),
    });
  } catch (e) {
    console.error("GET /api/sorteo/album", e);
    return NextResponse.json(
      { ok: false, album: [], msg: "Error" },
      { status: 500 },
    );
  }
}

// POST: agrega un ganador a la ronda activa con el próximo orden (tope 10, sin duplicar dni).
// body: { dni, nombre, marco, premio, premioImg, instancia }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const dni = String(b.dni ?? "").trim();
  const nombre = String(b.nombre ?? "").trim();
  const marco = String(b.marco ?? "oro").toLowerCase();
  const premio = b.premio != null ? String(b.premio) : null;
  const premioImg = b.premioImg != null ? String(b.premioImg) : null;
  const instancia = Number.isFinite(+b.instancia) ? Math.trunc(+b.instancia) : 0;
  if (!dni || !nombre) {
    return NextResponse.json({ ok: false, msg: "Faltan datos" }, { status: 400 });
  }
  try {
    const item = await prisma.$transaction(async (tx) => {
      const ronda = await getRondaActiva(tx, true);
      if (!ronda) return null;
      const ya = await tx.sorteo_album.findUnique({
        where: { rondaId_dni: { rondaId: ronda.id, dni } },
      });
      if (ya) return ya; // ya está en el álbum de esta ronda
      const count = await tx.sorteo_album.count({ where: { rondaId: ronda.id } });
      if (count >= MAX_ALBUM) return null;
      if (ronda.estado === "armado")
        await tx.sorteo_ronda.update({
          where: { id: ronda.id },
          data: { estado: "sorteando" },
        });
      return tx.sorteo_album.create({
        data: {
          rondaId: ronda.id,
          orden: count + 1,
          instancia,
          dni,
          nombre,
          marco,
          premio,
          premioImg,
        },
      });
    });
    if (!item)
      return NextResponse.json(
        { ok: false, msg: "Álbum completo" },
        { status: 409 },
      );
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/sorteo/album", e);
    return NextResponse.json({ ok: false, msg: "Error" }, { status: 500 });
  }
}

// DELETE: vacía los ganadores de la ronda activa (para pruebas). Requiere clave.
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
    console.error("DELETE /api/sorteo/album", e);
    return NextResponse.json({ ok: false, msg: "Error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
