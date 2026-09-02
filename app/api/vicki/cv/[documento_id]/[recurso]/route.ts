import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VICKI_URL = process.env.VICKI_API_URL ?? "http://chat-agent:8000";

// Recursos del CV: miniatura, archivo (PDF) y texto de contingencia.
// Se hace proxy en vez de exponer chat-agent al navegador para que el archivo
// viaje por la sesión de ever, como el resto de la app.
const RECURSOS = new Set(["thumb", "file", "texto"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ documento_id: string; recurso: string }> },
) {
  const { documento_id, recurso } = await params;
  if (!/^\d+$/.test(documento_id) || !RECURSOS.has(recurso)) {
    return NextResponse.json({ error: "recurso inválido" }, { status: 400 });
  }
  try {
    const r = await fetch(`${VICKI_URL}/cv/${documento_id}/${recurso}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok || recurso === "texto") {
      const txt = await r.text();
      return new NextResponse(txt, {
        status: r.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    // binario: se pasa el body tal cual (sin bufferear el PDF entero)
    const headers = new Headers();
    for (const h of ["content-type", "content-length", "content-disposition", "cache-control"]) {
      const v = r.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new NextResponse(r.body, { status: r.status, headers });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Error de conexión a Vicki" },
      { status: 502 },
    );
  }
}
