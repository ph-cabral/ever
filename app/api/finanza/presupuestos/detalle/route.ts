import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proxy → FastAPI indicadores-api (/compras/oc-detalle-area) para el MODAL de
// detalle de la pestaña "Presupuestos" de /finanza (2026-09-02): al hacer click
// en una fila de "Ejecución del presupuesto" se abren las OC de esa área
// agrupadas por mes (una fila por OC: número de movimiento, fecha, importe y
// observación). Mismo recorte que el agregado (canceladas afuera, importes
// pesificados), así los totales del modal cierran con la fila.
//
// `codigo` = tipo de comprobante de la OC (= el "área"). `desde`/`hasta` son
// MESES 'YYYY-MM', igual que en /api/finanza/presupuestos.
// Protegido por el módulo "finanza" (middleware.ts + lib/auth/modules.ts).
const YM = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const codigo = sp.get("codigo")?.trim() || "";
  const desde = sp.get("desde")?.trim() || "";
  const hasta = sp.get("hasta")?.trim() || "";

  if (!/^\d{1,6}$/.test(codigo)) {
    return NextResponse.json(
      { error: "'codigo' inválido: se espera el código de área (numérico)" },
      { status: 400 },
    );
  }
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
    const qs = new URLSearchParams({ codigo });
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const res = await fetch(`${API_URL}/compras/oc-detalle-area?${qs}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
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
    console.error("GET /api/finanza/presupuestos/detalle", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de compras" },
      { status: 503 },
    );
  }
}
