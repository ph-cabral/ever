import { NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://indicadores_api:8001";

export async function GET() {
  try {
    const res = await fetch(`${FASTAPI_URL}/indicadores/tiempos`, {
      // Sin cache — datos siempre frescos
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de indicadores", detail: error },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("GET /api/indicadores/tiempos", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de indicadores" },
      { status: 503 }
    );
  }
}

