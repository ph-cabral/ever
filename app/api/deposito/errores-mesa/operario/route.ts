import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Proxy → FastAPI indicadores-api: nombre del operario/controlador por N° de
// Personal (WMS), para la pantalla inicial del widget de escritorio.
// Ej: /api/deposito/errores-mesa/operario?nro=185
export async function GET(req: NextRequest) {
  const nro = req.nextUrl.searchParams.get("nro");
  if (!nro) {
    return NextResponse.json({ error: "Falta 'nro'" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${API_URL}/deposito/errores-mesa/operario?nro=${encodeURIComponent(nro)}`,
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Operario no encontrado", detail: data },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/deposito/errores-mesa/operario", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
