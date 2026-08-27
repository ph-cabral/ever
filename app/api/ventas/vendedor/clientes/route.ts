import { NextRequest, NextResponse } from "next/server";
import { resolverAccesoVendedor, vendedorParam } from "@/lib/ventas/vendedorAcceso";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Proxy → FastAPI indicadores-api: búsqueda de clientes (Magnus) por código
// o nombre (substring) — alimenta el autocomplete del filtro de
// /ventas/vendedor (pedido de Pablo 2026-08-14). Sin `q`, no busca nada (evita
// traer el padrón completo por accidente).
//
// Acceso por vendedor (mismo pedido, 2026-08-14): un usuario no-admin NUNCA
// debe encontrar acá un cliente que no es suyo — se resuelve su
// vendedorCodigo server-side (ver resolverAccesoVendedor) y se lo pasa al
// backend, que filtra ANTES de devolver la lista. Sin vendedor asignado
// todavía: lista vacía siempre, ni siquiera pega al backend.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ clientes: [] });
  }

  const acceso = await resolverAccesoVendedor();
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }
  if (!acceso.isAdmin && !acceso.vendedorCodigo) {
    return NextResponse.json({ clientes: [], sinVendedorAsignado: true });
  }

  try {
    const qs = new URLSearchParams({ q });
    const vend = vendedorParam(sp, acceso);
    if (vend) qs.set("vendedor", vend);
    const res = await fetch(`${API_URL}/clientes?${qs.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de clientes", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/ventas/vendedor/clientes", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
