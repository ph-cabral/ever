import { NextRequest, NextResponse } from "next/server";
import { resolverAccesoBulones } from "@/lib/ventas/bulonesAcceso";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy -> FastAPI indicadores-api (/ventas/bulones/bonificacion).
//
// A diferencia de los otros proxies de /ventas/bulones, este NO reenvía
// `vendedor` al back aunque el usuario sea no-admin: la bonificación son notas
// de crédito por CONCEPTO, sin artículo y por lo tanto sin línea, y el número
// es de TODA la empresa. Acotarlo a una cartera daría un prorrateo calculado
// sobre una venta parcial, que no significa nada. Ver bonificaciones.py.
//
// El acceso igual se resuelve: quien no puede ver la vista tampoco ve esto, y
// un no-admin sin vendedor asignado recibe el mismo vacío que en los rankings.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde")?.trim() || undefined;
  const hasta = sp.get("hasta")?.trim() || undefined;

  const acceso = await resolverAccesoBulones();
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }
  if (!acceso.isAdmin && !acceso.vendedorCodigo) {
    return NextResponse.json({
      desde: desde ?? null,
      hasta: hasta ?? null,
      bonificacionEmpresa: 0,
      ventaTotal: 0,
      ventaBulones: 0,
      participacion: 0,
      montoBulones: 0,
      porConcepto: [],
      porMes: [],
    });
  }

  try {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const res = await fetch(
      `${API_URL}/ventas/bulones/bonificacion?${qs.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(55000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const motivo = typeof detail?.detail === "string" ? detail.detail : null;
      return NextResponse.json(
        {
          error: motivo
            ? `Error en API de bonificación: ${motivo}`
            : "Error en API de bonificación",
          detail,
        },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/ventas/bulones/bonificacion", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de ventas" },
      { status: 503 },
    );
  }
}
