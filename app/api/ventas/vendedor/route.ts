import { NextRequest, NextResponse } from "next/server";
import { resolverAccesoVendedor } from "@/lib/ventas/vendedorAcceso";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: ventas de UN cliente agrupadas por línea
// de artículo, año actual y año anterior (con desglose mensual) — para
// /ventas/vendedor (pedido de Pablo 2026-08-14). Ver fetch_ventas_por_linea
// en ventas.py (indicadores-api) para la fuente/criterio de "venta neta".
//
// Acceso por vendedor (mismo pedido, 2026-08-14): resuelve server-side si
// quien pide es admin (sin restricción) o no-admin (solo su
// vendedorCodigo) y se lo pasa al backend, que además vuelve a verificar
// que el cliente pedido sea realmente de ese vendedor (permitido=false si
// no) — defensa en profundidad aunque el filtro de /clientes ya evite que
// alguien llegue hasta acá con un cliente ajeno.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cliente = sp.get("cliente")?.trim();
  if (!cliente) {
    return NextResponse.json(
      { error: "Falta 'cliente' (código de cliente)" },
      { status: 400 },
    );
  }

  const acceso = await resolverAccesoVendedor();
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }
  if (!acceso.isAdmin && !acceso.vendedorCodigo) {
    return NextResponse.json(
      { error: "Tu usuario no tiene vendedor asignado — pedile a un admin que te lo asigne en /admin/usuarios" },
      { status: 403 },
    );
  }

  try {
    const qs = new URLSearchParams({ cliente });
    if (!acceso.isAdmin) qs.set("vendedor", String(acceso.vendedorCodigo));
    const res = await fetch(`${API_URL}/ventas/vendedor?${qs.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de ventas por vendedor", detail },
        { status: res.status },
      );
    }
    const data = await res.json();
    if (data?.permitido === false) {
      return NextResponse.json(
        { error: "Ese cliente no corresponde a tu vendedor" },
        { status: 403 },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/ventas/vendedor", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
