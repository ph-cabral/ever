import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Proxy → FastAPI indicadores-api: búsqueda de clientes (Magnus) por código
// o nombre (substring) — alimenta el autocomplete del filtro de
// /ventas/vendedor (pedido de Pablo 2026-08-14). Sin `q`, no busca nada (evita
// traer el padrón completo por accidente).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ clientes: [] });
  }
  try {
    const res = await fetch(`${API_URL}/clientes?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de clientes", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/ventas/vendedor/clientes", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
