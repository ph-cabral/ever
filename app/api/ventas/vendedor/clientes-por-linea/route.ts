import { NextRequest, NextResponse } from "next/server";
import { resolverAccesoVendedor } from "@/lib/ventas/vendedorAcceso";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: clientes que compraron una línea de
// artículo, ordenados por MONTO ($) de mayor a menor, en el mismo rango de
// 12 meses que /api/ventas/vendedor/top-clientes y
// /api/ventas/vendedor/top-lineas — para el modal de /ventas/vendedor al
// hacer click en una línea del ranking "Top 10 líneas" (pedido de Pablo
// 2026-08-18: "en caso de línea debe verse en la tabla los clientes, de
// mayor a menor en gasto"). Ver fetch_clientes_por_linea en ventas.py.
//
// Acceso por vendedor: mismo criterio que el resto de /api/ventas/vendedor/*
// — se resuelve server-side si quien pide es admin (todos los clientes que
// compraron esa línea) o no-admin (solo los de su cartera).
function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const linea = sp.get("linea")?.trim();
  const desde = sp.get("desde")?.trim() || undefined;
  const hasta = sp.get("hasta")?.trim() || undefined;

  if (!linea) {
    return NextResponse.json({ error: "Falta 'linea'" }, { status: 400 });
  }

  const acceso = await resolverAccesoVendedor();
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }
  if (!acceso.isAdmin && !acceso.vendedorCodigo) {
    // Mismo tratamiento que el resto de las rutas de /ventas/vendedor: sin
    // vendedor asignado todavía = cero clientes visibles, no "sin
    // restricción".
    return NextResponse.json({
      linea,
      desde: desde ?? mesActual(),
      hasta: hasta ?? mesActual(),
      totalClientes: 0,
      porMonto: [],
    });
  }

  try {
    const qs = new URLSearchParams({ linea });
    if (!acceso.isAdmin) qs.set("vendedor", String(acceso.vendedorCodigo));
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const res = await fetch(`${API_URL}/ventas/vendedor/clientes-por-linea?${qs.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de clientes por línea", detail },
        { status: res.status },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/ventas/vendedor/clientes-por-linea", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
