import { NextRequest, NextResponse } from "next/server";
import { resolverAccesoVendedor } from "@/lib/ventas/vendedorAcceso";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: clientes que compraron una línea de
// artículo, con el mismo desglose año/mes y las mismas dos métricas
// ($/unidades) que la tabla línea×año del modo "cliente" — para el modal de
// /ventas/vendedor al hacer click en una línea del ranking "Top 10 líneas"
// (pedido de Pablo 2026-08-18: "en caso de línea debe verse en la tabla los
// clientes, de mayor a menor en gasto"; ampliado 2026-08-20 con los toggles
// $/Unidades y por mes/por año). Ver fetch_clientes_por_linea en ventas.py.
//
// Ya NO se pasan desde/hasta: el back devuelve los 2 años completos y el
// filtro YTD/Meses lo hace el front sobre el desglose ya traído.
//
// Acceso por vendedor: mismo criterio que el resto de /api/ventas/vendedor/*
// — se resuelve server-side si quien pide es admin (todos los clientes que
// compraron esa línea) o no-admin (solo los de su cartera).
function aniosPorDefecto(): { anioAnterior: number; anioActual: number } {
  const y = new Date().getFullYear();
  return { anioAnterior: y - 1, anioActual: y };
}

function anioVacio() {
  return {
    cantidad: 0,
    monto: 0,
    meses: Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      cantidad: 0,
      monto: 0,
    })),
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const linea = sp.get("linea")?.trim();

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
    const { anioAnterior, anioActual } = aniosPorDefecto();
    return NextResponse.json({
      linea,
      anioAnterior,
      anioActual,
      tieneDatos: false,
      totalClientes: 0,
      clientes: [],
      totales: { anioAnterior: anioVacio(), anioActual: anioVacio() },
    });
  }

  try {
    const qs = new URLSearchParams({ linea });
    if (!acceso.isAdmin) qs.set("vendedor", String(acceso.vendedorCodigo));
    const res = await fetch(`${API_URL}/ventas/vendedor/clientes-por-linea?${qs.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      // El detail de FastAPI trae el error real de SQL — sin esto el front
      // sólo mostraba "Error en API de clientes por línea" y había que ir a
      // la pestaña Network para saber qué pasó.
      const motivo =
        typeof detail?.detail === "string" ? detail.detail : null;
      return NextResponse.json(
        {
          error: motivo
            ? `Error en API de clientes por línea: ${motivo}`
            : "Error en API de clientes por línea",
          detail,
        },
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
