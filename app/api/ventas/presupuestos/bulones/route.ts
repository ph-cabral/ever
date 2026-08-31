import { NextRequest, NextResponse } from "next/server";
import { resolverAccesoBulones } from "@/lib/ventas/bulonesAcceso";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy -> FastAPI indicadores-api (/ventas/presupuestos/bulones) para
// /ventas/presupuestos (2026-08-31): los presupuestos de bulonería separados
// por estado. Mismo contrato y MISMA resolución de acceso que
// /api/ventas/bulones/*: admin = toda la empresa; no-admin = sólo lo suyo,
// resuelto server-side y NUNCA tomado del query string.
//
// Quién ENTRA a la vista sale de la misma bandera `bulonesAccesoTotal`
// (lib/auth/permissions.ts): los permisos de vista son por sector, y esta
// pantalla es del responsable de la línea, no de todo el sector ventas.
//
// Diferencia de criterio con /api/ventas/bulones/*: allá "lo suyo" es la
// cartera de clientes del vendedor; acá es el vendedor que CARGÓ el
// presupuesto (Pre_PresupCab.Vendedor). Un presupuesto es un acto del
// vendedor, no del dueño de la zona del cliente. Ver presupuestos.py.
function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const VACIO = (desde: string, hasta: string) => ({
  desde,
  hasta,
  truncado: false,
  resumen: { cantidad: 0, renglones: 0, neto: 0, total: 0, unidades: 0, pendiente: 0 },
  porEstado: [],
  presupuestos: [],
});

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde")?.trim() || undefined;
  const hasta = sp.get("hasta")?.trim() || undefined;

  const acceso = await resolverAccesoBulones();
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }
  if (!acceso.isAdmin && !acceso.vendedorCodigo) {
    // Sin vendedor asignado todavía = no ve nada (no "sin restricción"),
    // mismo criterio que el resto de /api/ventas/*.
    return NextResponse.json(VACIO(desde ?? mesActual(), hasta ?? desde ?? mesActual()));
  }

  try {
    const qs = new URLSearchParams();
    if (!acceso.isAdmin) qs.set("vendedor", String(acceso.vendedorCodigo));
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const res = await fetch(
      `${API_URL}/ventas/presupuestos/bulones?${qs.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(55000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const motivo = typeof detail?.detail === "string" ? detail.detail : null;
      return NextResponse.json(
        {
          error: motivo
            ? `Error en API de presupuestos: ${motivo}`
            : "Error en API de presupuestos",
          detail,
        },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/ventas/presupuestos/bulones", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
