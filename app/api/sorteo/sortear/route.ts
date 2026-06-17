import { NextResponse } from "next/server";

const APPS = process.env.SORTEO_APPS_URL;

export async function POST(req: Request) {
  if (!APPS) {
    return NextResponse.json(
      { ok: false, msg: "Falta SORTEO_APPS_URL en .env.local" },
      { status: 500 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const modo = body.modo === "real" ? "real" : "prueba";
  const n = String(body.n ?? 1);
  const clave = String(body.clave ?? "");

  const url = new URL(APPS);
  url.searchParams.set("api", "sortear");
  url.searchParams.set("modo", modo);
  url.searchParams.set("n", n);
  if (modo === "real") url.searchParams.set("clave", clave);

  try {
    const r = await fetch(url.toString(), { cache: "no-store" });
    return NextResponse.json(await r.json());
  } catch (e) {
    console.error("POST /api/sorteo/sortear", e);
    return NextResponse.json({ ok: false, msg: "Error al sortear" }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
