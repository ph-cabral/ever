import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX = 10;

// GET: álbum ordenado (1..10)
export async function GET() {
  try {
    const album = await prisma.sorteo_album.findMany({ orderBy: { orden: "asc" } });
    return NextResponse.json({ ok: true, album });
  } catch (e) {
    console.error("GET /api/sorteo/album", e);
    return NextResponse.json({ ok: false, album: [], msg: "Error" }, { status: 500 });
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
    return NextResponse.json({ ok: false, msg: "Faltan datos" }, { status: 400 });
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
    if (!item) return NextResponse.json({ ok: false, msg: "Álbum completo" }, { status: 409 });
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
  const esperado = process.env.SORTEO_ALBUM_CLAVE || process.env.SORTEO_CLAVE || "";
  if (!esperado || clave !== esperado) {
    return NextResponse.json({ ok: false, msg: "No autorizado" }, { status: 401 });
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
