 import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Endpoints públicos sin API key. Corren server-side (no CORS).
const DOLAR = "https://dolarapi.com/v1/dolares";
const INFL_MENS = "https://api.argentinadatos.com/v1/finanzas/indices/inflacion";
const INFL_IA = "https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual";
const PF = "https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo";
const TC_HIST =
  "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial";

async function j<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}
const last = <T,>(a: T[] | null): T | null => (a && a.length ? a[a.length - 1] : null);

export async function GET() {
  const [dolar, infM, infIA, pf] = await Promise.all([
    j<{ nombre: string; compra: number; venta: number }[]>(DOLAR),
    j<{ valor: number }[]>(INFL_MENS),
    j<{ valor: number }[]>(INFL_IA),
    j<{ tnaClientes: number | null }[]>(PF),
  ]);

  const dolares = (dolar ?? []).map((d) => ({ nombre: d.nombre, compra: d.compra ?? null, venta: d.venta ?? null }));
  const tnas = (pf ?? []).map((x) => x.tnaClientes).filter((n): n is number => typeof n === "number" && n > 0);
  const plazoFijoTNA = tnas.length ? tnas.reduce((a, b) => a + b, 0) / tnas.length : null;
  const inflacionSerie = (infM ?? [])
    .slice(-14)
    .map((x: any) => ({ fecha: x.fecha, valor: x.valor }));
  const tcSerie = (tcHist ?? [])
    .slice(-30)
    .map((x) => ({ fecha: x.fecha, venta: x.venta }));
  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    dolares,
    inflacionMensual: last(infM)?.valor ?? null,
    inflacionInteranual: last(infIA)?.valor ?? null,
    plazoFijoTNA,
    inflacionSerie,
    tcSerie,
  });
}
