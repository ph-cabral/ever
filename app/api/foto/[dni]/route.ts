import { NextResponse } from "next/server";

const APPS = process.env.SORTEO_APPS_URL;

// Proxy: marca un ganador como ya sorteado (flag FALSE) en el Sheet. Requiere clave.
export async function POST(req: Request) {
  if (!APPS) {
    return NextResponse.json(
      { ok: false, msg: "Falta SORTEO_APPS_URL en .env" },
      { status: 500 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const fila = String(body.fila ?? "");
  const clave = String(body.clave ?? "");

  const url = new URL(APPS);
  url.searchParams.set("api", "marcar");
  url.searchParams.set("fila", fila);
  url.searchParams.set("clave", clave);

  try {
    const r = await fetch(url.toString(), { cache: "no-store" });
    return NextResponse.json(await r.json());
  } catch (e) {
    console.error("POST /api/sorteo/marcar", e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
