import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Proxy → FastAPI indicadores-api: consumo mensual de TODOS los artículos
// (sin filtro de código) en un rango de MESES (YYYY-MM) + stock por
// depósito. Para el botón "Tabla" de /compras/consumo (pedido de Pablo
// 2026-08-11) — mismo patrón que consumo-articulo (singular).
//
// Timeout más alto que el del singular (2026-08-12): esta consulta agrega en
// SQL las ventas de TODOS los artículos del rango — más pesada que un solo
// artículo aunque el SUM ya se hace en SQL Server (ver NOTA rendimiento en
// fetch_consumo_articulos, indicadores-api/compras.py).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (!desde || !hasta) {
    return NextResponse.json(
      { error: "Faltan 'desde'/'hasta'" },
      { status: 400 },
    );
  }
  try {
    const res = await fetch(
      `${API_URL}/compras/consumo-articulos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
      { cache: "no-store", signal: AbortSignal.timeout(85000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de consumo de artículos", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/compras/consumo-articulos", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
