import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";

// Proxy → FastAPI indicadores-api: stock del depósito 1 (central), paginado
// (código, nombre, stock sumado por ubicación, proveedor). No trae los 4mil+
// artículos de un tiro: page/page_size se resuelven server-side en WMS.
export async function GET(req: NextRequest) {
  const page = req.nextUrl.searchParams.get("page") ?? "1";
  const pageSize = req.nextUrl.searchParams.get("page_size") ?? "50";
  const q = req.nextUrl.searchParams.get("q");
  const params = new URLSearchParams({ page, page_size: pageSize });
  if (q) params.set("q", q);
  try {
    const res = await fetch(`${API_URL}/deposito/stock?${params}`, {
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
    console.error("GET /api/deposito/stock", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
