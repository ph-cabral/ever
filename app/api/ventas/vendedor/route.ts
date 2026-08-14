import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: ventas de UN cliente agrupadas por línea
// de artículo, año actual y año anterior (con desglose mensual) — para
// /ventas/vendedor (pedido de Pablo 2026-08-14). Ver fetch_ventas_por_linea
// en ventas.py (indicadores-api) para la fuente/criterio de "venta neta".
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cliente = sp.get("cliente")?.trim();
  if (!cliente) {
    return NextResponse.json(
      { error: "Falta 'cliente' (código de cliente)" },
      { status: 400 },
    );
  }
  try {
    const res = await fetch(
      `${API_URL}/ventas/vendedor?cliente=${encodeURIComponent(cliente)}`,
      { cache: "no-store", signal: AbortSignal.timeout(55000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de ventas por vendedor", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/ventas/vendedor", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
