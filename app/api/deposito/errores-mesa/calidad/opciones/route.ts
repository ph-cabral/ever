import { NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Proxy → FastAPI indicadores-api: opciones fijas del select de Detalle
// Error PROPIAS de Calidad (REDISEÑO 2026-08-20, a pedido de Pablo) —
// distintas de las de Mesa (/api/deposito/errores-mesa/opciones). Ver
// DETALLE_ERROR_OPCIONES_CALIDAD / opciones_calidad en errores_mesa.py.
export async function GET() {
  try {
    const res = await fetch(`${API_URL}/deposito/errores-mesa/calidad/opciones`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Error al obtener opciones" },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/deposito/errores-mesa/calidad/opciones", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
