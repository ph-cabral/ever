import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";

// Proxy → FastAPI indicadores-api: stock del depósito 1 (central) para una
// lista puntual de códigos (?codigos=cod1,cod2,...), sin paginar. Usado por
// /compras/faltantes (columna "Stock").
export async function GET(req: NextRequest) {
  const codigos = req.nextUrl.searchParams.get("codigos");
  if (!codigos) return NextResponse.json({ rows: [] });
  try {
    const params = new URLSearchParams({ codigos });
    const res = await fetch(`${API_URL}/deposito/stock-por-articulos?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de stock", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/deposito/stock-por-articulos", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
