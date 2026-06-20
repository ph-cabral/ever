import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const APPS = process.env.SORTEO_APPS_URL;

export async function GET() {
  if (!APPS) {
    return NextResponse.json(
      { ok: false, msg: "Falta SORTEO_APPS_URL en .env" },
      { status: 500 },
    );
  }
  try {
    const r = await fetch(`${APPS}?api=participantes`, { cache: "no-store" });
    const data = await r.json();

    const parts = Array.isArray(data?.participantes) ? data.participantes : [];
    const dnis = parts.map((p: any) => String(p.dni)).filter(Boolean);
    if (dnis.length) {
      const l = await prisma.legajo.findMany({
        where: { dni: { in: dnis } },
        select: { dni: true, sector: true },
      });
      const m = new Map(l.map((x) => [x.dni, x.sector]));
      for (const p of parts) p.sector = m.get(String(p.dni)) ?? null;
    }

    return NextResponse.json({ ...data, participantes: parts });
  } catch (e) {
    console.error("GET /api/sorteo/participantes", e);
    return NextResponse.json(
      { ok: false, msg: "No se pudo leer participantes" },
      { status: 502 },
    );
  }
}

export const dynamic = "force-dynamic";
