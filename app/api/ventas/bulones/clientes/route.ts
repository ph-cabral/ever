import { NextRequest, NextResponse } from "next/server";
import { resolverAccesoBulones } from "@/lib/ventas/bulonesAcceso";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Proxy → FastAPI indicadores-api: búsqueda de clientes (Magnus) por código o
// nombre — alimenta el buscador de /ventas/bulones.
//
// Es el gemelo de /api/ventas/vendedor/clientes y pega al MISMO backend; lo
// único que cambia es que resuelve el acceso con resolverAccesoBulones, así
// los vendedores con acceso total a bulonería (Julio Blanco, ver
// lib/ventas/bulonesAcceso.ts) también encuentran acá cualquier cliente y no
// sólo los de su cartera. Si esta vista siguiera usando la ruta de
// /ventas/vendedor, verían el 100% en los rankings pero el buscador les
// devolvería sólo su cartera.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ clientes: [] });
  }

  const acceso = await resolverAccesoBulones();
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }
  if (!acceso.isAdmin && !acceso.vendedorCodigo) {
    return NextResponse.json({ clientes: [], sinVendedorAsignado: true });
  }

  try {
    const qs = new URLSearchParams({ q });
    if (!acceso.isAdmin) qs.set("vendedor", String(acceso.vendedorCodigo));
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
    console.error("GET /api/ventas/bulones/clientes", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
