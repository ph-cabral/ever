import { NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Proxy → FastAPI indicadores-api: opciones fijas de los selects (Aviso/Mesa,
// Detalle Error) del widget de Errores de Mesa. Ver errores_mesa.py.
export async function GET() {
  try {
    const res = await fetch(`${API_URL}/deposito/errores-mesa/opciones`, {
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
    console.error("GET /api/deposito/errores-mesa/opciones", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
