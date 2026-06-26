import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: faltantes agrupados por OT (NUEVA fuente de
// /deposito/faltantes). Por cada OT de Picking: renglones cumplidos (recolectados)
// vs faltantes (sin recolectar). Excluye pedidos descartados/anulados (estado Magnus).
// Sin params → último día con armado. Con ?desde&hasta (YYYY-MM-DD) → ese rango.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const qs = new URLSearchParams();
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetch(`${API_URL}/deposito/faltantes-ot${suffix}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de depósito (faltantes-ot)", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/deposito/faltantes-ot", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
