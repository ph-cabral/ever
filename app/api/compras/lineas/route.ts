import { NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Proxy → FastAPI indicadores-api: líneas del catálogo (StkFer_ArtParamet.
// Nivel1) con cantidad de artículos en cada una. Para el datalist del input
// "línea" de /compras/consumo (pedido de Pablo 2026-08-12) — así se ve en la
// propia vista cuántos artículos hay por línea, sin adivinar de antemano si
// conviene dropdown o texto libre. Sin parámetros, catálogo completo.
export async function GET() {
  try {
    const res = await fetch(`${API_URL}/compras/lineas`, {
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de líneas", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/compras/lineas", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
