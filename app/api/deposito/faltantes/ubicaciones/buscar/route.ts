import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";

// Proxy → FastAPI: tablas con columna de ubicación + cantidad/existencia, para
// localizar de dónde sacar la cantidad por ubicación. Temporal/diagnóstico.
// ?db=WMS (default) | EVERWEAR
export async function GET(req: NextRequest) {
  const db = req.nextUrl.searchParams.get("db") ?? "WMS";
  try {
    const res = await fetch(
      `${API_URL}/deposito/ubicaciones/buscar-tabla?db=${encodeURIComponent(db)}`,
      { cache: "no-store", signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API (buscar-tabla)", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/deposito/faltantes/ubicaciones/buscar", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
