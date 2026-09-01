import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Proxy → FastAPI indicadores-api: alta en lote del widget de Mesa de Control
// (REDISEÑO 2026-08-04) — botón "Finalizar" manda
// {nroPedido, nroOperario, items:[{codArticulo, detalleError}, ...]} y se
// inserta 1 fila de deposito.errores_mesa POR ARTÍCULO (cada uno con su
// propio error). Ver insert_error_mesa_items en errores_mesa.py. Reemplaza
// al POST plano de /api/deposito/errores-mesa (que sigue vivo, lo usa el
// widget de Calidad) para el caso "1 error por artículo".
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/deposito/errores-mesa/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: "No se pudo guardar el registro", detail: data },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("POST /api/deposito/errores-mesa/items", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
