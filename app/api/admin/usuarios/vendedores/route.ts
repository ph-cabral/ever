import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Proxy → FastAPI indicadores-api: catálogo de vendedores (Magnus,
// Ped_Usu_Arma) — alimenta el selector de "Vendedor" en /admin/usuarios
// (pedido de Pablo 2026-08-14, acceso por vendedor en /ventas/vendedor).
// Admin-only: es información interna de asignación de usuarios.
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const res = await fetch(`${API_URL}/vendedores`, {
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de vendedores", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/admin/usuarios/vendedores", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
