import { NextRequest, NextResponse } from "next/server";
import { resolverAccesoVendedor } from "@/lib/ventas/vendedorAcceso";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: top clientes por cantidad/monto del año
// en curso, para el ranking debajo de la tabla de /ventas/vendedor (pedido
// de Pablo 2026-08-14). Ver fetch_top_clientes en ventas.py.
//
// Acceso por vendedor: mismo criterio que /api/ventas/vendedor y
// /api/ventas/vendedor/clientes — se resuelve server-side si quien pide es
// admin (ranking de toda la empresa) o no-admin (solo su vendedorCodigo,
// ranking dentro de su propio portfolio de clientes).
export async function GET(req: NextRequest) {
  const acceso = await resolverAccesoVendedor();
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }
  if (!acceso.isAdmin && !acceso.vendedorCodigo) {
    // Mismo tratamiento que el resto de las rutas de /ventas/vendedor: sin
    // vendedor asignado todavía = cero clientes visibles, no "sin
    // restricción".
    return NextResponse.json({ anioActual: new Date().getFullYear(), porCantidad: [], porMonto: [] });
  }

  try {
    const qs = new URLSearchParams();
    if (!acceso.isAdmin) qs.set("vendedor", String(acceso.vendedorCodigo));
    const res = await fetch(`${API_URL}/ventas/vendedor/top-clientes?${qs.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de top clientes", detail },
        { status: res.status },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/ventas/vendedor/top-clientes", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
