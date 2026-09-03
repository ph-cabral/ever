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
//   Cada columna informa items (artículos distintos) Y unidades:
//     · Faltantes  -> CantPend de los renglones sin existencia del mes
//       (GET /deposito/faltantes, mismo fetch que ya se hace para la torta).
//     · Con OC     -> Cantidad de los renglones de OC del mes, solo de los
//       artículos de la columna (GET /compras/ordenes-mes → `unidades`).
//     · Ingresados -> CantidadIngresada de los remitos del mes, solo de los
//       artículos de la columna (GET /compras/ingresos → CantidadIngresada).
//   Las unidades siguen el mismo recorte del funnel que los items (col2 ⊆ col1,
//   col3 ⊆ col2), así las tres columnas hablan del mismo conjunto y no cuesta
//   ninguna consulta extra: los 3 endpoints ya se llamaban.
//   Cada columna informa también `importe` ($ a precio de VENTA): unidades de
//   la etapa × precio unitario del artículo, con el precio derivado del mismo
//   fetch de /deposito/faltantes (Importe/CantPend). Sin consultas extra.
//
//   ocTotalItems/ocTotalUnidades (2026-08-31): el set B COMPLETO, sin recortar
//   por faltantes — o sea toda la OC del mes. Es el denominador de la columna 2
//   ("135 de 701 items"): el recorte del funnel hacía parecer que faltaban OC
//   cuando en realidad la card solo contaba las de artículos faltantes.
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
//
//   Totales unidades/$ + % (agregado 2026-07-28): además del conteo en
//   items, se informa faltantesUnidades/faltantesImporte (suma de
//   CantPend/Importe por renglón del set A completo, mismo dato que ya trae
//   /deposito/faltantes para la torta — no cuesta una llamada extra) y
//   pctUnidades/pctImporte = qué % representan sobre TODO lo pedido ese mes
//   (indicadores-api GET /ventas/pedidos-mes, best-effort → pedidosMesWarn).
//   pctUnidades/pctImporte quedan en null si el denominador no está disponible
//   o es 0 (no se puede dividir por cero / no informar un % falso).
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

// Suma las unidades de un map solo para los artículos de la columna (el
// funnel ya viene recortado: col2 ⊆ col1, col3 ⊆ col2).
const sumUnid = (arts: string[], map: Map<string, number>) =>
  Math.round(arts.reduce((a, c) => a + (map.get(c) ?? 0), 0) * 100) / 100;

// $ de una etapa = unidades de esa etapa × precio unitario del artículo. El
// precio sale del mismo fetch de /deposito/faltantes que ya se hace (Importe =
// PrecioVenta × CantPend por renglón, ver deposito.py), así que no cuesta
// ninguna consulta extra: precioUnit = Σ Importe / Σ CantPend por artículo.
// Se valoriza a precio de VENTA, igual que la card "$ faltantes" original.
const sumImporte = (
  arts: string[],
  unidMap: Map<string, number>,
  precioMap: Map<string, number>,
) =>
  Math.round(
    arts.reduce((a, c) => a + (unidMap.get(c) ?? 0) * (precioMap.get(c) ?? 0), 0) * 100,
  ) / 100;

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
  const ocUnidMap = new Map<string, number>();
  let ocWarn = false;
  try {
    const ocJson = await getJson(
      `${API_URL}/compras/ordenes-mes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
    );
    setB = new Set((ocJson.articulos ?? []) as string[]);
    for (const [cod, u] of Object.entries((ocJson.unidades ?? {}) as Record<string, number>)) {
      ocUnidMap.set(cod, Number(u) || 0);
    }
  } catch (e) {
    ocWarn = true;
    console.error("GET /api/compras/metricas — ordenes-mes", e);
  }

  // 3) Set C: artículos con remito de ingreso x OC concretado en el mes
  // (Magnus, best-effort).
  const setC = new Set<string>();
  const ingUnidMap = new Map<string, number>();
  let ingresoWarn = false;
  try {
    const ingJson = await getJson(
      `${API_URL}/compras/ingresos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
    );
    for (const r of (ingJson.rows ?? []) as {
      CodArticulo: string;
      CantidadIngresada?: number;
    }[]) {
      const cod = (r.CodArticulo ?? "").trim();
      if (!cod) continue;
      setC.add(cod);
      ingUnidMap.set(cod, (ingUnidMap.get(cod) ?? 0) + (Number(r.CantidadIngresada) || 0));
    }
  } catch (e) {
    ingresoWarn = true;
    console.error("GET /api/compras/metricas — ingresos", e);
  }

  // Denominador de la columna 2: TODA la OC del mes, sin recortar por faltantes
  // (setB completo). Sirve para leer la card como "X de Y items": Y es lo que
  // sale del reporte de OC del mes de Magnus, X lo que además era faltante.
  // No cuesta ninguna consulta extra: setB/ocUnidMap ya están armados.
  const ocTotalItems = setB.size;
  let ocTotalUnidades = 0;
  for (const u of ocUnidMap.values()) ocTotalUnidades += u;
  ocTotalUnidades = Math.round(ocTotalUnidades * 100) / 100;

  // Funnel estricto: col2 ⊆ col1 (∩ setB), col3 ⊆ col2 (∩ setC).
  const faltantes = [...setA].sort();
  const conOC = faltantes.filter((c) => setB.has(c));
  const ingresados = conOC.filter((c) => setC.has(c));

  // 4) Torta: clasifica el set A (Faltantes) en Importados/Nacionales/EVER
  // WEAR INDUSTRIAL. Proveedor: Magnus faltantes viejo (best-effort) con
  // fallback a la OC pendiente; Importación: solo de la OC pendiente.
  // faltUnidMap/faltImporteMap: mismo fetch de arriba (deposito/faltantes),
  // reusado también para sumar unidades ($ y cantidad) de los faltantes del
  // mes — CantPend/Importe ya vienen calculados por renglón desde
  // fetch_faltantes (indicadores-api/deposito.py). Si esta llamada falla,
  // clasifWarn ya avisa (afecta torta Y estos 2 totales).
  const faltProveedorMap = new Map<string, string | null>();
  const faltUnidMap = new Map<string, number>();
  const faltImporteMap = new Map<string, number>();
  let clasifWarn = false;
  try {
    const faltJson = await getJson(
      `${API_URL}/deposito/faltantes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&historico=1`,
    );
    for (const r of (faltJson.rows ?? []) as {
      CodArticulo: string;
      Proveedor: string | null;
      CantPend?: number;
      Importe?: number;
    }[]) {
      const cod = (r.CodArticulo ?? "").trim();
      if (!cod) continue;
      const prev = faltProveedorMap.get(cod);
      if (!prev && r.Proveedor) faltProveedorMap.set(cod, r.Proveedor);
      faltUnidMap.set(cod, (faltUnidMap.get(cod) ?? 0) + (Number(r.CantPend) || 0));
      faltImporteMap.set(cod, (faltImporteMap.get(cod) ?? 0) + (Number(r.Importe) || 0));
    }
  } catch (e) {
    clasifWarn = true;
    console.error("GET /api/compras/metricas — deposito/faltantes (proveedor)", e);
  }

  // Total de unidades y $ de los faltantes del mes (set A completo, no solo
  // los clasificados) — suma por artículo desde los maps de arriba.
  let faltantesUnidades = 0;
  let faltantesImporte = 0;
  for (const cod of faltantes) {
    faltantesUnidades += faltUnidMap.get(cod) ?? 0;
    faltantesImporte += faltImporteMap.get(cod) ?? 0;
  }
  faltantesUnidades = Math.round(faltantesUnidades * 100) / 100;
  faltantesImporte = Math.round(faltantesImporte * 100) / 100;

  // Precio unitario por artículo (venta) — base para valorizar las etapas 2 y 3
  // en $ sin pedir nada más a Magnus.
  const precioUnitMap = new Map<string, number>();
  for (const [cod, imp] of faltImporteMap) {
    const u = faltUnidMap.get(cod) ?? 0;
    if (u > 0) precioUnitMap.set(cod, imp / u);
  }

  // Denominador del %: total de TODO lo pedido (unidades/$) ese mes, sin
  // filtrar por artículo (indicadores-api /ventas/pedidos-mes, best-effort —
  // si falla, el % simplemente no se informa, ver pedidosMesWarn).
  let pedidosMesUnidades = 0;
  let pedidosMesImporte = 0;
  let pedidosMesWarn = false;
  try {
    const pedJson = await getJson(
      `${API_URL}/ventas/pedidos-mes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
    );
    pedidosMesUnidades = Number(pedJson.totalUnidades) || 0;
    pedidosMesImporte = Number(pedJson.totalImporte) || 0;
  } catch (e) {
    pedidosMesWarn = true;
    console.error("GET /api/compras/metricas — ventas/pedidos-mes", e);
  }

  const pctUnidades =
    pedidosMesUnidades > 0 ? Math.round((faltantesUnidades / pedidosMesUnidades) * 1000) / 10 : null;
  const pctImporte =
    pedidosMesImporte > 0 ? Math.round((faltantesImporte / pedidosMesImporte) * 1000) / 10 : null;

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
    pedidosMesWarn,
    faltantesUnidades,
    faltantesImporte,
    pedidosMesUnidades,
    pedidosMesImporte,
    pctUnidades,
    pctImporte,
    ocTotalItems,
    ocTotalUnidades,
    columnas: [
      {
        key: "faltantes",
        label: "Faltantes",
        total: faltantes.length,
        unidades: faltantesUnidades,
        importe: faltantesImporte,
        articulos: faltantes,
      },
      {
        key: "conOC",
        label: "Con OC",
        total: conOC.length,
        unidades: sumUnid(conOC, ocUnidMap),
        importe: sumImporte(conOC, ocUnidMap, precioUnitMap),
        articulos: conOC,
      },
      {
        key: "ingresados",
        label: "Ingresados",
        total: ingresados.length,
        unidades: sumUnid(ingresados, ingUnidMap),
        importe: sumImporte(ingresados, ingUnidMap, precioUnitMap),
        articulos: ingresados,
      },
    ],
    torta: [
      { key: "importados", label: "Importados", total: importados },
      { key: "nacionales", label: "Nacionales", total: nacionales },
      { key: "fabrica", label: "EVER WEAR INDUSTRIAL", total: fabrica },
    ],
  });
}
