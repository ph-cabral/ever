import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────────────────────
// /compras/metricas — funnel MENSUAL de un mes calendario, en ARTÍCULOS
// distintos (items), no en unidades:
//
//   Columna 1 "Faltantes": CodArticulo distintos marcados "sin existencia"
//     (preparado.faltante_existencia, existencia=false) con fecha dentro del
//     mes. Misma fuente/origen que /deposito/faltantes (ver memoria
//     ever-faltante-flujo-completo) — simplificación: no se resuelve "última
//     marca por renglón" como en /compras/faltantes, alcanza con que haya
//     existido AL MENOS una marca "sin existencia" ese mes para ese artículo.
//
//   Columna 2 "Con OC": de los artículos de la columna 1, cuántos tuvieron
//     al menos un renglón de Orden de Compra HECHO ese mismo mes (indicadores-
//     api GET /compras/ordenes-mes, por FecMovim de la cabecera) — no importa
//     si ya se recibió o sigue pendiente.
//
//   Columna 3 "Ingresados": de los artículos de la columna 2, cuántos tuvieron
//     un remito de ingreso x OC ya concretado ese mismo mes (indicadores-api
//     GET /compras/ingresos, por FecComprobante).
//
//   Es un funnel estricto (decisión del usuario): col2 ⊆ col1, col3 ⊆ col2.
//   Los sets B y C (Magnus, indicadores-api) son best-effort: si alguno no
//   responde, la columna correspondiente (y las que dependen de ella) se
//   informan en `warn` mas no rompen la vista.
//
//   Gráfico de torta (decisión del usuario): clasifica el mismo set A
//   (Faltantes del mes) en 3 grupos — Importados / Nacionales / EVER WEAR
//   INDUSTRIAL (proveedor propio, se saca de los otros 2 grupos). Reusa
//   exactamente las mismas 2 fuentes y la misma precedencia que ya usa
//   /api/compras/faltantes-consumo para Proveedor/Importación por artículo:
//     · Proveedor: primero Magnus "faltantes" viejo (GET /deposito/faltantes,
//       fetch_faltantes), fallback a la OC "por llegar" (GET
//       /compras/ordenes-pendientes) si el primero no trae proveedor.
//     · Importación: SOLO sale de /compras/ordenes-pendientes (no hay otra
//       fuente) — default false (Nacional) si el artículo no tiene OC
//       asociada, mismo default que ya usa faltantes-consumo.
// ──────────────────────────────────────────────────────────────────────────────

const PROVEEDOR_OBJETIVO = "ever wear s.a. industrial";
// Mismo patrón que app/fabrica/faltantes/page.tsx: normaliza acentos/mayúsculas
// antes de comparar (Magnus no es consistente con el formato del proveedor).
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").trim();
const esProveedorObjetivo = (p: string | null) => !!p && norm(p).includes(PROVEEDOR_OBJETIVO);

async function getJson(url: string) {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// mes = "YYYY-MM" (o null/ inválido → mes actual, hora del server). Devuelve
// el rango calendario completo [desde, hasta] de ese mes.
function mesRange(mes: string | null) {
  const now = new Date();
  const valido = mes && /^\d{4}-\d{2}$/.test(mes);
  const [yStr, mStr] = (
    valido ? (mes as string) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  ).split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const desde = `${yStr}-${mStr}-01`;
  const ultimoDia = new Date(y, m, 0).getDate(); // día 0 del mes siguiente = último día de este mes
  const hasta = `${yStr}-${mStr}-${String(ultimoDia).padStart(2, "0")}`;
  return { mes: `${yStr}-${mStr}`, desde, hasta };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { mes, desde, hasta } = mesRange(sp.get("mes"));

  // 1) Set A: artículos faltantes del mes (Postgres propio — rápido, no
  // depende de Magnus).
  let marks: { codArticulo: string | null }[] = [];
  try {
    marks = await prisma.faltante_existencia.findMany({
      where: {
        existencia: false,
        fecha: { gte: new Date(desde), lte: new Date(hasta) },
      },
      select: { codArticulo: true },
    });
  } catch (e) {
    console.error("GET /api/compras/metricas — faltante_existencia", e);
    return NextResponse.json(
      { error: "No se pudo leer los faltantes del mes" },
      { status: 503 },
    );
  }
  const setA = new Set(
    marks.map((m) => (m.codArticulo ?? "").trim()).filter(Boolean),
  );

  // 2) Set B: artículos con OC hecha en el mes (Magnus, best-effort).
  let setB = new Set<string>();
  let ocWarn = false;
  try {
    const ocJson = await getJson(
      `${API_URL}/compras/ordenes-mes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
    );
    setB = new Set((ocJson.articulos ?? []) as string[]);
  } catch (e) {
    ocWarn = true;
    console.error("GET /api/compras/metricas — ordenes-mes", e);
  }

  // 3) Set C: artículos con remito de ingreso x OC concretado en el mes
  // (Magnus, best-effort).
  let setC = new Set<string>();
  let ingresoWarn = false;
  try {
    const ingJson = await getJson(
      `${API_URL}/compras/ingresos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
    );
    setC = new Set(
      ((ingJson.rows ?? []) as { CodArticulo: string }[])
        .map((r) => (r.CodArticulo ?? "").trim())
        .filter(Boolean),
    );
  } catch (e) {
    ingresoWarn = true;
    console.error("GET /api/compras/metricas — ingresos", e);
  }

  // Funnel estricto: col2 ⊆ col1 (∩ setB), col3 ⊆ col2 (∩ setC).
  const faltantes = [...setA].sort();
  const conOC = faltantes.filter((c) => setB.has(c));
  const ingresados = conOC.filter((c) => setC.has(c));

  // 4) Torta: clasifica el set A (Faltantes) en Importados/Nacionales/EVER
  // WEAR INDUSTRIAL. Proveedor: Magnus faltantes viejo (best-effort) con
  // fallback a la OC pendiente; Importación: solo de la OC pendiente.
  const faltProveedorMap = new Map<string, string | null>();
  let clasifWarn = false;
  try {
    const faltJson = await getJson(
      `${API_URL}/deposito/faltantes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&historico=1`,
    );
    for (const r of (faltJson.rows ?? []) as { CodArticulo: string; Proveedor: string | null }[]) {
      const cod = (r.CodArticulo ?? "").trim();
      if (!cod) continue;
      const prev = faltProveedorMap.get(cod);
      if (!prev && r.Proveedor) faltProveedorMap.set(cod, r.Proveedor);
    }
  } catch (e) {
    clasifWarn = true;
    console.error("GET /api/compras/metricas — deposito/faltantes (proveedor)", e);
  }

  const ocInfoMap = new Map<string, { Proveedor: string | null; Importacion: boolean }>();
  try {
    const ocPendJson = await getJson(`${API_URL}/compras/ordenes-pendientes`);
    for (const r of (ocPendJson.rows ?? []) as {
      CodArticulo: string;
      Proveedor: string | null;
      Importacion: boolean;
    }[]) {
      const cod = (r.CodArticulo ?? "").trim();
      if (cod) ocInfoMap.set(cod, { Proveedor: r.Proveedor ?? null, Importacion: !!r.Importacion });
    }
  } catch (e) {
    clasifWarn = true;
    console.error("GET /api/compras/metricas — ordenes-pendientes (proveedor/importacion)", e);
  }

  let importados = 0;
  let nacionales = 0;
  let fabrica = 0;
  for (const cod of faltantes) {
    const oc = ocInfoMap.get(cod);
    const proveedor = faltProveedorMap.get(cod) || oc?.Proveedor || null;
    if (esProveedorObjetivo(proveedor)) fabrica++;
    else if (oc?.Importacion) importados++;
    else nacionales++;
  }

  return NextResponse.json({
    mes,
    desde,
    hasta,
    ocWarn,
    ingresoWarn,
    clasifWarn,
    columnas: [
      { key: "faltantes", label: "Faltantes", total: faltantes.length, articulos: faltantes },
      { key: "conOC", label: "Con OC", total: conOC.length, articulos: conOC },
      { key: "ingresados", label: "Ingresados", total: ingresados.length, articulos: ingresados },
    ],
    torta: [
      { key: "importados", label: "Importados", total: importados },
      { key: "nacionales", label: "Nacionales", total: nacionales },
      { key: "fabrica", label: "EVER WEAR INDUSTRIAL", total: fabrica },
    ],
  });
}
