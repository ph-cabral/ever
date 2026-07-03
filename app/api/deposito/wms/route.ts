import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: Productividad WMS por rango de fechas.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = new URLSearchParams();
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const incluir410 = searchParams.get("incluir_410");
  if (desde) qs.set("desde", desde);
  if (hasta) qs.set("hasta", hasta);
  if (incluir410) qs.set("incluir_410", incluir410);

  try {
    const res = await fetch(`${API_URL}/deposito/wms?${qs.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de depósito (WMS)", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/deposito/wms", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
