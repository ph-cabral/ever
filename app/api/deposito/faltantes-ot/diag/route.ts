import { NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI: diagnóstico para confirmar el mapeo de faltantes-ot.
// Devuelve columnas reales de OT / OTItem, los candidatos a la columna del pedido
// (OT) y a la cantidad pedida (OTItem), y una muestra de renglones de Picking.
// Abrir en el browser: /api/deposito/faltantes-ot/diag
export async function GET() {
  try {
    const res = await fetch(`${API_URL}/deposito/faltantes-ot/diag`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de depósito (faltantes-ot/diag)", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/deposito/faltantes-ot/diag", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
