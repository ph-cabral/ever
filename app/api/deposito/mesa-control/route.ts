import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: productividad por Controlador (Mesas de
// Control), vía SP RPT_V325_ProductividadPorControlador. Solo lectura sobre
// EVERWEAR. `meses`='2026-05,2026-06,2026-07' (uno o más, separados por coma).
export async function GET(req: NextRequest) {
  const meses = req.nextUrl.searchParams.get("meses");
  if (!meses) {
    return NextResponse.json(
      { error: "Falta el parámetro 'meses'" },
      { status: 400 },
    );
  }
  try {
    const res = await fetch(
      `${API_URL}/deposito/mesa-control?meses=${encodeURIComponent(meses)}`,
      { cache: "no-store", signal: AbortSignal.timeout(45000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de mesa de control", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/deposito/mesa-control", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de mesa de control" },
      { status: 503 },
    );
  }
}
