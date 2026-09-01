import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: consumo mensual de UN artículo en un rango
// de MESES (YYYY-MM) + stock por depósito (1/2/3). Para /compras/consumo
// (2026-08-11). Mismo patrón que compras-valorizado.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const codigo = sp.get("codigo")?.trim();
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (!codigo || !desde || !hasta) {
    return NextResponse.json(
      { error: "Faltan 'codigo'/'desde'/'hasta'" },
      { status: 400 },
    );
  }
  try {
    const res = await fetch(
      `${API_URL}/compras/consumo-articulo?codigo=${encodeURIComponent(codigo)}&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
      { cache: "no-store", signal: AbortSignal.timeout(45000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de consumo por artículo", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/compras/consumo-articulo", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
