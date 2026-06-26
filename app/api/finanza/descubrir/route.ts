import { NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: introspección de Magnus para ubicar la tabla
// de facturación (códigos 11/22/23/24/25, tablas candidatas, columnas pista).
// Apoyo para completar el bloque CONFIG de indicadores-api/finanza.py.
export async function GET() {
  try {
    const res = await fetch(`${API_URL}/finanza/descubrir`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de descubrimiento", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/finanza/descubrir", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de facturación" },
      { status: 503 },
    );
  }
}
