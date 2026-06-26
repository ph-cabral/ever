import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: facturación del día (ENTRA cód 11 − SALE
// cód 22/23/24/25), neto con/sin IVA. Solo lectura sobre Magnus.
// Protegido por el módulo "finanza" (ver middleware.ts + lib/auth/modules.ts).
export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get("fecha");
  const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
  try {
    const res = await fetch(`${API_URL}/finanza/facturacion-dia${qs}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de facturación", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/finanza/facturacion", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de facturación" },
      { status: 503 },
    );
  }
}
