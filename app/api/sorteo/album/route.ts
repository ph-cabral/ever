import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX = 10;

// GET: álbum ordenado (1..10)
export async function GET() {
  try {
<<<<<<< HEAD
    const album = await prisma.sorteo_album.findMany({
      orderBy: { orden: "asc" },
    });
    const norm = (s: any) => String(s ?? "").replace(/\D/g, "");
    const dnis = album.map((a) => norm(a.dni));
    const l = dnis.length
      ? await prisma.legajo.findMany({
          where: { dni: { in: dnis } },
          select: { dni: true, sector: true },
        })
      : [];
    const m = new Map(l.map((x) => [norm(x.dni), x.sector]));
    return NextResponse.json({
      ok: true,
      album: album.map((a) => ({ ...a, sector: m.get(norm(a.dni)) ?? null })),
    });
  } catch (e) {
    console.error("GET /api/sorteo/album", e);
    return NextResponse.json(
      { ok: false, album: [], msg: "Error" },
      { status: 500 },
    );
=======
    const album = await prisma.sorteo_album.findMany({ orderBy: { orden: "asc" } });
    return NextResponse.json({ ok: true, album });
  } catch (e) {
    console.error("GET /api/sorteo/album", e);
    return NextResponse.json({ ok: false, album: [], msg: "Error" }, { status: 500 });
>>>>>>> d2aae8c (edit lottery)
  }
}

// POST: agrega un ganador con el próximo orden (tope 10, sin duplicar dni).
// body: { dni, nombre, marco, premio }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const dni = String(b.dni ?? "").trim();
  const nombre = String(b.nombre ?? "").trim();
  const marco = String(b.marco ?? "oro").toLowerCase();
  const premio = b.premio != null ? String(b.premio) : null;
  if (!dni || !nombre) {
<<<<<<< HEAD
    return NextResponse.json(
      { ok: false, msg: "Faltan datos" },
      { status: 400 },
    );
=======
    return NextResponse.json({ ok: false, msg: "Faltan datos" }, { status: 400 });
>>>>>>> d2aae8c (edit lottery)
  }
  try {
    const item = await prisma.$transaction(async (tx) => {
      const ya = await tx.sorteo_album.findUnique({ where: { dni } });
      if (ya) return ya; // ya está en el álbum
      const count = await tx.sorteo_album.count();
      if (count >= MAX) return null;
      return tx.sorteo_album.create({
        data: { orden: count + 1, dni, nombre, marco, premio },
      });
    });
<<<<<<< HEAD
    if (!item)
      return NextResponse.json(
        { ok: false, msg: "Álbum completo" },
        { status: 409 },
      );
=======
    if (!item) return NextResponse.json({ ok: false, msg: "Álbum completo" }, { status: 409 });
>>>>>>> d2aae8c (edit lottery)
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/sorteo/album", e);
    return NextResponse.json({ ok: false, msg: "Error" }, { status: 500 });
  }
}

// DELETE: vacía el álbum. Requiere clave === SORTEO_ALBUM_CLAVE (o SORTEO_CLAVE).
export async function DELETE(req: Request) {
  const b = await req.json().catch(() => ({}));
  const clave = String(b.clave ?? "");
<<<<<<< HEAD
  const esperado =
    process.env.SORTEO_ALBUM_CLAVE || process.env.SORTEO_CLAVE || "";
  if (!esperado || clave !== esperado) {
    return NextResponse.json(
      { ok: false, msg: "No autorizado" },
      { status: 401 },
    );
=======
  const esperado = process.env.SORTEO_ALBUM_CLAVE || process.env.SORTEO_CLAVE || "";
  if (!esperado || clave !== esperado) {
    return NextResponse.json({ ok: false, msg: "No autorizado" }, { status: 401 });
>>>>>>> d2aae8c (edit lottery)
  }
  try {
    await prisma.sorteo_album.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/sorteo/album", e);
    return NextResponse.json({ ok: false, msg: "Error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
