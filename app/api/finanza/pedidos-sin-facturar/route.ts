import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api: pedidos que WMS ya despachó (Picking
// ejecutado) pero que no tienen contraparte en Ven_CompCabecera ese mismo
// día — venta real confirmada por depósito, factura atrasada en Magnus.
// No se suma solo a /api/finanza/facturacion (riesgo de doble conteo si
// después sí se factura normal): es un chequeo aparte para revisar y, si
// corresponde, cargar a mano en /api/finanza/ajuste.
// Protegido por el módulo "finanza" (ver middleware.ts + lib/auth/modules.ts).
export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get("fecha");
  if (!fecha) {
    return NextResponse.json({ error: "Falta 'fecha' (YYYY-MM-DD)" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${API_URL}/finanza/pedidos-sin-facturar?fecha=${encodeURIComponent(fecha)}`,
      { cache: "no-store", signal: AbortSignal.timeout(45000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de pedidos sin facturar", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/finanza/pedidos-sin-facturar", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de facturación" },
      { status: 503 },
    );
  }
}
