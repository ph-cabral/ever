import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: unidades y $ (a precio de VENTA, no de OC)
// de las Órdenes de Compra hechas en un rango de fechas libre — selector
// independiente del mes del funnel de /compras (2026-08-04).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (!desde || !hasta) {
    return NextResponse.json({ error: "Faltan 'desde'/'hasta'" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${API_URL}/compras/compras-valorizado?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
      { cache: "no-store", signal: AbortSignal.timeout(45000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de compras (valorizado)", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/compras/compras-valorizado", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
