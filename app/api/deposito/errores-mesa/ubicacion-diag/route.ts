import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Proxy → FastAPI indicadores-api: diagnóstico de la columna de OT detectada
// para "Observaciones"/ubicación. Ej: /api/deposito/errores-mesa/ubicacion-diag?nro=752555
export async function GET(req: NextRequest) {
  const nro = req.nextUrl.searchParams.get("nro");
  const qs = nro ? `?nro=${encodeURIComponent(nro)}` : "";
  try {
    const res = await fetch(`${API_URL}/deposito/errores-mesa/ubicacion-diag${qs}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Error en diagnóstico de ubicación", detail: data },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/deposito/errores-mesa/ubicacion-diag", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
