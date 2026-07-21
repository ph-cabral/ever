import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Proxy → FastAPI indicadores-api: artículos de la OT de Picking del pedido
// (WMS), para el selector multiple-choice de los widgets de escritorio
// "Errores de Mesa de Control" / "Calidad". [] si el pedido no tiene OT
// todavía — no es un error bloqueante para el widget.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ nro: string }> },
) {
  const { nro } = await params;
  try {
    const res = await fetch(
      `${API_URL}/deposito/pedido/${encodeURIComponent(nro)}/articulos`,
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: "No se pudieron traer los artículos del pedido", detail: data },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/deposito/pedido/[nro]/articulos", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
