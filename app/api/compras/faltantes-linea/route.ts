import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────────────────────
// /compras — sección "Faltantes por línea" (2026-08-26).
//
// Los faltantes de un mes, tal como se marcaron en /deposito/faltantes
// (preparado.faltante_existencia con existencia=false), separados en dos
// tablas — IMPORTADOS y NACIONALES — y agrupados por LÍNEA (no por artículo).
// Por cada línea:
//   · items          → artículos distintos faltantes
//   · cantFaltante   → suma de faltante_existencia.cantidad, o sea lo que el
//                      operario marcó como sin existencia (decisión:
//                      NO el CantPend de Magnus que usa la torta de arriba).
//   · cantComprada   → unidades de OC hechas ESE MISMO MES para esos mismos
//                      artículos (/compras/compras-valorizado, por FecMovim).
//   · monto          → esas unidades valorizadas a precio de VENTA (último
//                      PrecioVenta visto en Ven_PedRenPendientes), no al costo
//                      de la OC — mismo criterio que la card "Compras del mes".
//
// Origen (Importado / Nacional): misma precedencia que /api/compras/metricas.
//   · Importación sale SOLO de /compras/ordenes-pendientes; sin OC asociada →
//     Nacional (mismo default que faltantes-consumo y metricas).
//   · EVER WEAR S.A. INDUSTRIAL (proveedor propio) se EXCLUYE de la vista
//     (decisión): no se compra, se fabrica. Se informa cuántos
//     artículos se excluyeron en `excluidosFabrica`.
//
// Todo lo de Magnus es best-effort: si una fuente no responde, se avisa por
// warn y la vista muestra la parte que sí se pudo calcular.
// ──────────────────────────────────────────────────────────────────────────────

const PROVEEDOR_OBJETIVO = "ever wear s.a. industrial";
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").trim();
const esProveedorObjetivo = (p: string | null) => !!p && norm(p).includes(PROVEEDOR_OBJETIVO);

const SIN_LINEA = "SIN LÍNEA";

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function mesRange(mes: string | null) {
  const now = new Date();
  const valido = mes && /^\d{4}-\d{2}$/.test(mes);
  const [yStr, mStr] = (
    valido ? (mes as string) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  ).split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const desde = `${yStr}-${mStr}-01`;
  const ultimoDia = new Date(y, m, 0).getDate();
  const hasta = `${yStr}-${mStr}-${String(ultimoDia).padStart(2, "0")}`;
  return { mes: `${yStr}-${mStr}`, desde, hasta };
}

interface Acum {
  linea: string;
  items: number;
  cantFaltante: number;
  cantComprada: number;
  monto: number;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { mes, desde, hasta } = mesRange(sp.get("mes"));

  // 1) Faltantes marcados en el mes (Postgres propio) — unidades por artículo.
  let marks: { codArticulo: string | null; cantidad: number | null }[] = [];
  try {
    marks = await prisma.faltante_existencia.findMany({
      where: { existencia: false, fecha: { gte: new Date(desde), lte: new Date(hasta) } },
      select: { codArticulo: true, cantidad: true },
    });
  } catch (e) {
    console.error("GET /api/compras/faltantes-linea — faltante_existencia", e);
    return NextResponse.json({ error: "No se pudo leer los faltantes del mes" }, { status: 503 });
  }

  const faltanteUnid = new Map<string, number>();
  for (const m of marks) {
    const cod = (m.codArticulo ?? "").trim();
    if (!cod) continue;
    faltanteUnid.set(cod, (faltanteUnid.get(cod) ?? 0) + (Number(m.cantidad) || 0));
  }
  const codigos = [...faltanteUnid.keys()].sort();

  // 2) Proveedor / importación por artículo (Magnus, best-effort).
  const ocInfoMap = new Map<string, { Proveedor: string | null; Importacion: boolean }>();
  let clasifWarn = false;
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
    console.error("GET /api/compras/faltantes-linea — ordenes-pendientes", e);
  }

  // Proveedor "viejo" de Magnus, para detectar los de fábrica que no tienen OC
  // pendiente (misma precedencia que /api/compras/metricas).
  const faltProveedorMap = new Map<string, string | null>();
  try {
    const faltJson = await getJson(
      `${API_URL}/deposito/faltantes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&historico=1`,
    );
    for (const r of (faltJson.rows ?? []) as { CodArticulo: string; Proveedor: string | null }[]) {
      const cod = (r.CodArticulo ?? "").trim();
      if (cod && r.Proveedor && !faltProveedorMap.get(cod)) faltProveedorMap.set(cod, r.Proveedor);
    }
  } catch (e) {
    clasifWarn = true;
    console.error("GET /api/compras/faltantes-linea — deposito/faltantes", e);
  }

  // 3) OC del mes por artículo: unidades + $ a precio de venta (best-effort).
  const compradoUnid = new Map<string, number>();
  const compradoMonto = new Map<string, number>();
  let ocWarn = false;
  try {
    const valJson = await getJson(
      `${API_URL}/compras/compras-valorizado?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
    );
    for (const r of (valJson.rows ?? []) as {
      CodArticulo: string;
      Cantidad: number;
      Importe: number;
    }[]) {
      const cod = (r.CodArticulo ?? "").trim();
      if (!cod) continue;
      compradoUnid.set(cod, (compradoUnid.get(cod) ?? 0) + (Number(r.Cantidad) || 0));
      compradoMonto.set(cod, (compradoMonto.get(cod) ?? 0) + (Number(r.Importe) || 0));
    }
  } catch (e) {
    ocWarn = true;
    console.error("GET /api/compras/faltantes-linea — compras-valorizado", e);
  }

  // 4) Línea de cada artículo faltante (Magnus, best-effort → SIN LÍNEA).
  const lineaMap = new Map<string, string>();
  let lineaWarn = false;
  if (codigos.length) {
    try {
      const res = await fetch(`${API_URL}/compras/lineas-articulos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigos }),
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      for (const [cod, linea] of Object.entries((j.lineas ?? {}) as Record<string, string>)) {
        if (linea) lineaMap.set(cod.trim(), linea);
      }
    } catch (e) {
      lineaWarn = true;
      console.error("GET /api/compras/faltantes-linea — lineas-articulos", e);
    }
  }

  // 5) Agrupar: origen → línea.
  const grupos: Record<"importados" | "nacionales", Map<string, Acum>> = {
    importados: new Map(),
    nacionales: new Map(),
  };
  let excluidosFabrica = 0;

  for (const cod of codigos) {
    const oc = ocInfoMap.get(cod);
    const proveedor = faltProveedorMap.get(cod) || oc?.Proveedor || null;
    if (esProveedorObjetivo(proveedor)) {
      excluidosFabrica++;
      continue;
    }
    const key = oc?.Importacion ? "importados" : "nacionales";
    const linea = lineaMap.get(cod) ?? SIN_LINEA;
    const mapa = grupos[key];
    const acum = mapa.get(linea) ?? {
      linea,
      items: 0,
      cantFaltante: 0,
      cantComprada: 0,
      monto: 0,
    };
    acum.items += 1;
    acum.cantFaltante += faltanteUnid.get(cod) ?? 0;
    acum.cantComprada += compradoUnid.get(cod) ?? 0;
    acum.monto += compradoMonto.get(cod) ?? 0;
    mapa.set(linea, acum);
  }

  const armar = (mapa: Map<string, Acum>) => {
    const filas = [...mapa.values()]
      .map((a) => ({
        linea: a.linea,
        items: a.items,
        cantFaltante: Math.round(a.cantFaltante * 100) / 100,
        cantComprada: Math.round(a.cantComprada * 100) / 100,
        monto: Math.round(a.monto * 100) / 100,
      }))
      .sort((a, b) => b.cantFaltante - a.cantFaltante || a.linea.localeCompare(b.linea));
    const total = filas.reduce(
      (acc, f) => ({
        items: acc.items + f.items,
        cantFaltante: acc.cantFaltante + f.cantFaltante,
        cantComprada: acc.cantComprada + f.cantComprada,
        monto: acc.monto + f.monto,
      }),
      { items: 0, cantFaltante: 0, cantComprada: 0, monto: 0 },
    );
    return {
      lineas: filas,
      total: {
        items: total.items,
        cantFaltante: Math.round(total.cantFaltante * 100) / 100,
        cantComprada: Math.round(total.cantComprada * 100) / 100,
        monto: Math.round(total.monto * 100) / 100,
      },
    };
  };

  return NextResponse.json({
    mes,
    desde,
    hasta,
    ocWarn,
    clasifWarn,
    lineaWarn,
    excluidosFabrica,
    articulosFaltantes: codigos.length,
    importados: armar(grupos.importados),
    nacionales: armar(grupos.nacionales),
  });
}
