import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Proxy → FastAPI indicadores-api: lookup de un pedido (Fecha, Tipo Pedido,
// OT, N° Armador/Nombre) por Nro Pedido — usado por el widget de escritorio
// "Errores de Mesa de Control".
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ nro: string }> },
) {
  const { nro } = await params;
  try {
    const res = await fetch(
      `${API_URL}/deposito/pedido/${encodeURIComponent(nro)}`,
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Pedido no encontrado", detail: data },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/deposito/pedido/[nro]", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
