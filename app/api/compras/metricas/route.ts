import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  agruparFaltantesMes,
  codigosPorOrigen,
  ORIGEN_LABEL,
  type FilaFaltanteApi,
  type FaltantesMes,
  type OrigenFunnel,
} from "@/lib/compras/faltantesMes";
import type { OrigenArticulo } from "@/lib/compras/origenArticulo";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────────────────────
// /compras — funnel MENSUAL de un mes calendario, en ARTÍCULOS distintos
// (items), no en unidades, calculado POR ORIGEN del artículo.
//
//   Columna 1 "Faltantes": CodArticulo distintos marcados "sin existencia"
//     (preparado.faltante_existencia, existencia=false) con fecha dentro del
//     mes, QUE ADEMÁS tengan renglón vivo en Magnus ese mes y pasen el recorte
//     de lib/compras/faltantesMes.ts (habilitados, sin pedidos cancelados).
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
//   Es un funnel estricto: col2 ⊆ col1, col3 ⊆ col2.
//
//   Cada columna informa items, unidades y $ (a precio de VENTA: unidades de la
//   etapa × precio unitario del artículo, derivado del mismo fetch de
//   /deposito/faltantes — Importe/CantPend por renglón, ver deposito.py). No
//   cuesta ninguna consulta extra.
//
// RECORTE (2026-09-03) — la vista contaba de más y no cerraba con el reporte de
// Magnus. Ahora los tres criterios de detalle_mes_extraccion.py se aplican acá,
// en lib/compras/faltantesMes.ts (ver el comentario de ese archivo):
//   · ORIGEN real del artículo (Stk_TiposArticulos) vía lib/compras/
//     origenArticulo.ts, el mismo criterio que /compras/faltantes y
//     /fabrica/faltantes. Reemplaza a la heurística `Importacion` de
//     /compras/ordenes-pendientes, que clasificaba mal y obligaba a un fetch
//     más (ese endpoint ya no se consulta desde acá).
//   · Solo artículos HABILITADOS.
//   · Sin renglones de pedidos cancelados o sin estado en Magnus.
//
//   El funnel se calcula para CADA origen (nacionales / importados / otros) más
//   "todos", todo en memoria sobre los mismos 3 sets: el selector de la vista
//   cambia de origen SIN volver a pegarle a Magnus.
//
//   ocTotalItems/ocTotalUnidades: el set B COMPLETO, sin recortar por faltantes
//   — o sea toda la OC del mes. Es el denominador de la columna 2 ("135 de 701
//   items"): el recorte del funnel hacía parecer que faltaban OC cuando en
//   realidad la card solo contaba las de artículos faltantes.
//
//   `origenes` clasifica el mismo set A recortado en las 5 categorías de
//   origenArticulo (Nacionales / Importados / Fábrica / Original / Otros) y
//   alimenta la torta y los badges del selector.
//
//   Los 3 fetches a Magnus salen EN PARALELO (antes eran secuenciales, 4
//   roundtrips uno atrás del otro) y son best-effort: si alguno no responde, la
//   columna correspondiente se informa en `warn` pero no rompe la vista.
// ──────────────────────────────────────────────────────────────────────────────

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

const r2 = (n: number) => Math.round(n * 100) / 100;

// Suma las unidades de un map solo para los artículos de la columna (el
// funnel ya viene recortado: col2 ⊆ col1, col3 ⊆ col2).
const sumUnid = (arts: string[], map: Map<string, number>) =>
  r2(arts.reduce((a, c) => a + (map.get(c) ?? 0), 0));

// $ de una etapa = unidades de esa etapa × precio unitario del artículo. El
// precio sale del mismo fetch de /deposito/faltantes que ya se hace (Importe =
// PrecioVenta × CantPend por renglón, ver deposito.py), así que no cuesta
// ninguna consulta extra. Se valoriza a precio de VENTA.
const sumImporte = (
  arts: string[],
  unidMap: Map<string, number>,
  precioMap: Map<string, number>,
) => r2(arts.reduce((a, c) => a + (unidMap.get(c) ?? 0) * (precioMap.get(c) ?? 0), 0));

interface Columna {
  key: string;
  label: string;
  total: number;
  unidades: number;
  importe: number;
}
interface Funnel {
  faltantesUnidades: number;
  faltantesImporte: number;
  columnas: Columna[];
}

/** Funnel completo de un origen. Todo en memoria: no consulta nada. */
function armarFunnel(
  origen: OrigenFunnel,
  faltMes: FaltantesMes,
  setA: Set<string>,
  setB: Set<string>,
  setC: Set<string>,
  ocUnidMap: Map<string, number>,
  ingUnidMap: Map<string, number>,
  precioUnitMap: Map<string, number>,
): Funnel {
  const faltantes = codigosPorOrigen(faltMes, setA, origen);
  const conOC = faltantes.filter((c) => setB.has(c));
  const ingresados = conOC.filter((c) => setC.has(c));

  let unidades = 0;
  let importe = 0;
  for (const cod of faltantes) {
    const a = faltMes.articulos.get(cod);
    if (!a) continue;
    unidades += a.unidades;
    importe += a.importe;
  }

  return {
    faltantesUnidades: r2(unidades),
    faltantesImporte: r2(importe),
    columnas: [
      { key: "faltantes", label: "Faltantes", total: faltantes.length, unidades: r2(unidades), importe: r2(importe) },
      {
        key: "conOC",
        label: "Con OC",
        total: conOC.length,
        unidades: sumUnid(conOC, ocUnidMap),
        importe: sumImporte(conOC, ocUnidMap, precioUnitMap),
      },
      {
        key: "ingresados",
        label: "Ingresados",
        total: ingresados.length,
        unidades: sumUnid(ingresados, ingUnidMap),
        importe: sumImporte(ingresados, ingUnidMap, precioUnitMap),
      },
    ],
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { mes, desde, hasta } = mesRange(sp.get("mes"));

  // 1) Set A: artículos faltantes del mes (Postgres propio — rápido, no
  // depende de Magnus). Si esto falla no hay vista posible.
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

  // 2) Los 3 fetches a Magnus, EN PARALELO (best-effort cada uno):
  //    · ordenes-mes      → set B (OC hecha ese mes) + unidades pedidas
  //    · ingresos         → set C (remito x OC concretado ese mes)
  //    · deposito/faltantes → origen, estado, unidades e importe por artículo
  const q = encodeURIComponent;
  const [ocRes, ingRes, faltRes] = await Promise.allSettled([
    getJson(`${API_URL}/compras/ordenes-mes?desde=${q(desde)}&hasta=${q(hasta)}`),
    getJson(`${API_URL}/compras/ingresos?desde=${q(desde)}&hasta=${q(hasta)}`),
    getJson(`${API_URL}/deposito/faltantes?desde=${q(desde)}&hasta=${q(hasta)}&historico=1`),
  ]);

  // Set B: artículos con OC hecha en el mes.
  const setB = new Set<string>();
  const ocUnidMap = new Map<string, number>();
  const ocWarn = ocRes.status !== "fulfilled";
  if (ocRes.status === "fulfilled") {
    const ocJson = ocRes.value;
    for (const cod of (ocJson.articulos ?? []) as string[]) setB.add(cod);
    for (const [cod, u] of Object.entries((ocJson.unidades ?? {}) as Record<string, number>)) {
      ocUnidMap.set(cod, Number(u) || 0);
    }
  } else {
    console.error("GET /api/compras/metricas — ordenes-mes", ocRes.reason);
  }

  // Set C: artículos con remito de ingreso x OC concretado en el mes.
  const setC = new Set<string>();
  const ingUnidMap = new Map<string, number>();
  const ingresoWarn = ingRes.status !== "fulfilled";
  if (ingRes.status === "fulfilled") {
    for (const r of (ingRes.value.rows ?? []) as {
      CodArticulo: string;
      CantidadIngresada?: number;
    }[]) {
      const cod = (r.CodArticulo ?? "").trim();
      if (!cod) continue;
      setC.add(cod);
      ingUnidMap.set(cod, (ingUnidMap.get(cod) ?? 0) + (Number(r.CantidadIngresada) || 0));
    }
  } else {
    console.error("GET /api/compras/metricas — ingresos", ingRes.reason);
  }

  // 3) Origen / estado / unidades por artículo — el recorte del mes.
  const clasifWarn = faltRes.status !== "fulfilled";
  if (clasifWarn) {
    console.error("GET /api/compras/metricas — deposito/faltantes", faltRes.reason);
  }
  const faltMes = agruparFaltantesMes(
    clasifWarn ? [] : ((faltRes.value.rows ?? []) as FilaFaltanteApi[]),
  );

  // Precio unitario por artículo (venta), para valorizar las etapas 2 y 3 sin
  // pedirle nada más a Magnus.
  const precioUnitMap = new Map<string, number>();
  for (const a of faltMes.articulos.values()) {
    if (a.unidades > 0) precioUnitMap.set(a.cod, a.importe / a.unidades);
  }

  // Denominador de la columna 2: TODA la OC del mes, sin recortar por faltantes.
  let ocTotalUnidades = 0;
  for (const u of ocUnidMap.values()) ocTotalUnidades += u;

  // 4) Un funnel por origen + "todos". Todo en memoria, sin consultas extra.
  const claves: OrigenFunnel[] = ["nacionales", "importados", "otros", "todos"];
  const funnels: Record<string, Funnel> = {};
  for (const k of claves) {
    funnels[k] = armarFunnel(k, faltMes, setA, setB, setC, ocUnidMap, ingUnidMap, precioUnitMap);
  }

  // 5) Torta + badges: el set A recortado, clasificado en las 5 categorías de
  // origenArticulo (incluye Fábrica y Original, que la vista no trabaja pero
  // tienen que verse para que nada desaparezca sin explicación).
  const cats: OrigenArticulo[] = ["nacionales", "importados", "fabrica", "original", "otros"];
  const origenes = cats.map((k) => ({
    key: k,
    label: ORIGEN_LABEL[k],
    total: codigosPorOrigen(faltMes, setA, k).length,
  }));

  return NextResponse.json({
    mes,
    desde,
    hasta,
    ocWarn,
    ingresoWarn,
    clasifWarn,
    // false = indicadores-api no informó el estado del artículo (columna no
    // detectada en StkFer_Articulos): NO se filtró por Habilitado.
    estadoArticuloDisponible: faltMes.estadoDisponible,
    unidadesDescartadas: r2(faltMes.unidadesDescartadas),
    ocTotalItems: setB.size,
    ocTotalUnidades: r2(ocTotalUnidades),
    origenDefault: "nacionales",
    origenes,
    funnels,
  });
}
