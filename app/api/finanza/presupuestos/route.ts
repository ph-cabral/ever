import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api (/compras/oc-por-area) para la pestaña
// "Presupuestos" de /finanza (2026-09-01): los "presupuestos por área" de
// compras SON órdenes de compra, y el área es el TIPO DE COMPROBANTE de la OC
// (ORDEN DE COMPRA · IMPO · INDUSTRIA · RRHH · MARKETING · SISTEMAS IT ·
// INGRESO INDUSTRIA A COMERCIAL). Antes esta pestaña se armaba de una hoja
// del Excel financiero que se sube a mano; ahora lee la base en vivo.
// Protegido por el módulo "finanza" (middleware.ts + lib/auth/modules.ts),
// igual que el resto de /api/finanza/*.
//
// `desde`/`hasta` son MESES ('YYYY-MM'), no fechas: la vista se mira por mes
// y el default de la API es el mes en curso.
const YM = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde")?.trim() || "";
  const hasta = sp.get("hasta")?.trim() || "";
  for (const [nombre, v] of [
    ["desde", desde],
    ["hasta", hasta],
  ] as const) {
    if (v && !YM.test(v)) {
      return NextResponse.json(
        { error: `'${nombre}' inválido: se espera YYYY-MM` },
        { status: 400 },
      );
    }
  }

  try {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const res = await fetch(
      `${API_URL}/compras/oc-por-area?${qs.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(55000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const motivo = typeof detail?.detail === "string" ? detail.detail : null;
      return NextResponse.json(
        {
          error: motivo
            ? `Error en API de órdenes de compra: ${motivo}`
            : "Error en API de órdenes de compra",
          detail,
        },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/finanza/presupuestos", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
