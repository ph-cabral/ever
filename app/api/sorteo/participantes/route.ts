import { NextResponse } from "next/server";

const APPS = process.env.SORTEO_APPS_URL;

export async function GET() {
  if (!APPS) {
    return NextResponse.json(
      { ok: false, msg: "Falta SORTEO_APPS_URL en .env.local" },
      { status: 500 }
    );
  }
  try {
    const r = await fetch(`${APPS}?api=participantes`, { cache: "no-store" });
    const data = await r.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/sorteo/participantes", e);
    return NextResponse.json(
      { ok: false, msg: "No se pudo leer participantes" },
      { status: 502 }
    );
  }
}

export const dynamic = "force-dynamic";
