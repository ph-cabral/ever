import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";

// Proxy → FastAPI: columnas reales de Ubicacion# + muestra, para confirmar el
// nombre de la columna de cantidad (UBIC_COL_CANT). Temporal/diagnóstico.
export async function GET(req: NextRequest) {
  const articulo = req.nextUrl.searchParams.get("articulo");
  if (!articulo)
    return NextResponse.json({ error: "falta articulo" }, { status: 400 });
  try {
    const res = await fetch(
      `${API_URL}/deposito/articulo/ubicaciones/diag?articulo=${encodeURIComponent(articulo)}`,
      { cache: "no-store", signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de ubicaciones (diag)", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/deposito/faltantes/ubicaciones/diag", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
