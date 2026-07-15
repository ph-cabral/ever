import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Proxy → FastAPI indicadores-api: alta de un registro de error de Mesa de
// Control (Postgres deposito.errores_mesa). Ver ever/sql/deposito_errores_mesa.sql.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/deposito/errores-mesa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
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
    console.error("POST /api/deposito/errores-mesa", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
