import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────────────────────
// /compras/faltantes — datos por (artículo, día) con consumo de OC por día.
//
//   1. Faltantes (Magnus): sin params = último snapshot; con ?desde&hasta = todos
//      los snapshots del rango, deduplicados por renglón, cada uno con PrimerDia
//      (primera aparición) y solo lo que sigue pendiente en la foto más nueva.
//   2. Se filtra a lo marcado "sin existencia" (preparado.faltante_existencia,
//      última marca por renglón).
//   3. Se agrupa por (artículo, PrimerDia) → "faltante de cada día" sin doble
//      contar (cada renglón cuenta una sola vez, en su día de aparición).
//   4. La OC "por llegar" (Magnus, en vivo) se reparte FIFO por fecha: cubre
//      primero el día más viejo y se va agotando. Así una misma OC no figura
//      cubriendo varios días.
//   5. Se persiste el consumo por día en preparado.faltante_oc_consumo
//      (best-effort: si la tabla no está creada aún, la vista igual funciona).
// ──────────────────────────────────────────────────────────────────────────────

interface FaltRow {
  NroPedOrigen: number;
  NroRengOrigen: number;
  CodArticulo: string;
  Nombre: string;
  CantPend: number;
  Importe: number;
  Linea: string | number | null;
  Proveedor: string | null;
  Fecha: string | null; // snapshot más nuevo del renglón en el rango
  PrimerDia: string | null; // primera aparición en el rango
}
interface OcRow {
  CodArticulo: string;
  PorLlegar: number;
  Proveedor: string | null;
  FechaEntrega: string | null;
  Importacion: boolean;
  NroOCs: string[];
}
type Estado = "completo" | "incompleto" | "sin_orden";

interface Bucket {
  CodArticulo: string;
  Nombre: string;
  Linea: string | number | null;
  Proveedor: string | null;
  fecha: string; // PrimerDia (día del faltante)
  faltan: number;
  importe: number;
  renglones: number;
  pedidos: Set<number>;
  cubierto: number;
  descubierto: number;
  ocTotal: number;
  fechaEntrega: string | null;
  importacion: boolean;
  ocs: string[];
  estado: Estado;
}

const keyLine = (p: number, r: number) => `${p}-${r}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function getJson(url: string) {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desdeParam = sp.get("desde");
  const hastaParam = sp.get("hasta");

  const qs = new URLSearchParams();
  if (desdeParam) qs.set("desde", desdeParam);
  if (hastaParam) qs.set("hasta", hastaParam);
  const faltUrl = `${API_URL}/deposito/faltantes${qs.toString() ? `?${qs}` : ""}`;

  // 1) faltantes (obligatorio) + OC (best-effort) en paralelo
  const [faltRes, ocRes] = await Promise.allSettled([
    getJson(faltUrl),
    getJson(`${API_URL}/compras/ordenes-pendientes`),
  ]);

  if (faltRes.status !== "fulfilled") {
    return NextResponse.json(
      { error: "No se pudo leer faltantes", detail: String(faltRes.reason) },
      { status: 503 },
    );
  }
  const faltJson = faltRes.value;
  const faltRows: FaltRow[] = faltJson.rows ?? [];
  const fecha: string | null = faltJson.fecha ?? null;

  let ocWarn = false;
  const ocMap = new Map<string, OcRow>();
  if (ocRes.status === "fulfilled") {
    for (const r of (ocRes.value.rows ?? []) as OcRow[]) {
      const cod = String(r.CodArticulo ?? "").trim();
      if (cod) ocMap.set(cod, r);
    }
  } else {
    ocWarn = true;
  }

  // rango efectivo (de las filas) para acotar la lectura de marcas
  let minPrimer: string | null = null;
  let maxFecha: string | null = null;
  for (const r of faltRows) {
    if (r.PrimerDia && (!minPrimer || r.PrimerDia < minPrimer)) minPrimer = r.PrimerDia;
    if (r.Fecha && (!maxFecha || r.Fecha > maxFecha)) maxFecha = r.Fecha;
  }

  // 2) marcas existencia=false (última marca por renglón) del rango
  const sinExistencia = new Set<string>();
  const desdeMarks = minPrimer ?? fecha;
  const hastaMarks = maxFecha ?? fecha;
  if (faltRows.length && desdeMarks && hastaMarks) {
    // new Date('YYYY-MM-DD') = medianoche UTC, igual que se guardan las marcas (@db.Date)
    const marks = await prisma.faltante_existencia.findMany({
      where: { fecha: { gte: new Date(desdeMarks), lte: new Date(hastaMarks) } },
      select: { nroPedOrigen: true, nroRengOrigen: true, existencia: true, fecha: true },
      orderBy: { fecha: "asc" },
    });
    const latest = new Map<string, boolean>();
    for (const m of marks) latest.set(keyLine(m.nroPedOrigen, m.nroRengOrigen), m.existencia);
    for (const [k, ex] of latest) if (ex === false) sinExistencia.add(k);
  }

  // 3) agrupar lo "sin existencia" por (artículo, primer día)
  const buckets = new Map<string, Bucket>();
  for (const it of faltRows) {
    if (!sinExistencia.has(keyLine(it.NroPedOrigen, it.NroRengOrigen))) continue;
    const cod = String(it.CodArticulo ?? "").trim();
    const dia = it.PrimerDia ?? it.Fecha ?? fecha ?? "";
    if (!cod || !dia) continue;
    const k = `${cod}__${dia}`;
    let b = buckets.get(k);
    if (!b) {
      b = {
        CodArticulo: cod,
        Nombre: it.Nombre,
        Linea: it.Linea ?? null,
        Proveedor: it.Proveedor,
        fecha: dia,
        faltan: 0,
        importe: 0,
        renglones: 0,
        pedidos: new Set<number>(),
        cubierto: 0,
        descubierto: 0,
        ocTotal: 0,
        fechaEntrega: null,
        importacion: false,
        ocs: [],
        estado: "sin_orden",
      };
      buckets.set(k, b);
    }
    b.faltan += it.CantPend || 0;
    b.importe += it.Importe || 0;
    b.renglones += 1;
    b.pedidos.add(it.NroPedOrigen);
    if (!b.Proveedor && it.Proveedor) b.Proveedor = it.Proveedor;
    if ((b.Linea === null || b.Linea === "") && it.Linea != null && it.Linea !== "")
      b.Linea = it.Linea;
  }

  // 4) por artículo: repartir la OC FIFO por fecha (día más viejo primero)
  const porArt = new Map<string, Bucket[]>();
  for (const b of buckets.values()) {
    const arr = porArt.get(b.CodArticulo) ?? [];
    arr.push(b);
    porArt.set(b.CodArticulo, arr);
  }
  const artImporte = new Map<string, number>();
  for (const [cod, arr] of porArt) {
    arr.sort((a, c) => (a.fecha < c.fecha ? -1 : a.fecha > c.fecha ? 1 : 0));
    const oc = ocMap.get(cod);
    const ocTotal = oc?.PorLlegar ?? 0;
    let supply = ocTotal;
    let imp = 0;
    for (const b of arr) {
      const cub = Math.min(Math.max(supply, 0), b.faltan);
      b.cubierto = cub;
      supply -= cub;
      b.descubierto = Math.max(b.faltan - cub, 0);
      b.ocTotal = ocTotal;
      if (oc) {
        b.fechaEntrega = oc.FechaEntrega ?? null;
        b.importacion = !!oc.Importacion;
        b.ocs = oc.NroOCs ?? [];
        if (!b.Proveedor && oc.Proveedor) b.Proveedor = oc.Proveedor;
      }
      b.estado =
        b.faltan > 0 && b.descubierto <= 0 ? "completo" : cub > 0 ? "incompleto" : "sin_orden";
      imp += b.importe;
    }
    artImporte.set(cod, imp);
  }

  // 5) ordenar: artículos por importe total desc, días asc dentro del artículo
  const rowsOut = [...buckets.values()]
    .sort((a, c) => {
      const ia = artImporte.get(a.CodArticulo) ?? 0;
      const ic = artImporte.get(c.CodArticulo) ?? 0;
      if (ic !== ia) return ic - ia;
      if (a.CodArticulo !== c.CodArticulo) return a.CodArticulo < c.CodArticulo ? -1 : 1;
      return a.fecha < c.fecha ? -1 : a.fecha > c.fecha ? 1 : 0;
    })
    .map((b) => ({
      CodArticulo: b.CodArticulo,
      Nombre: b.Nombre,
      Linea: b.Linea,
      Proveedor: b.Proveedor,
      fecha: b.fecha,
      faltan: r2(b.faltan),
      cubierto: r2(b.cubierto),
      descubierto: r2(b.descubierto),
      importe: r2(b.importe),
      renglones: b.renglones,
      pedidos: b.pedidos.size,
      ocTotal: r2(b.ocTotal),
      fechaEntrega: b.fechaEntrega,
      importacion: b.importacion,
      ocs: b.ocs,
      estado: b.estado,
    }));

  // 6) persistir el consumo por día (best-effort; tabla aplicada a mano por SQL)
  let consumoWarn = false;
  if (rowsOut.length) {
    try {
      const values = rowsOut.map(
        (r) =>
          Prisma.sql`(${r.fecha}::date, ${r.CodArticulo}, ${r.faltan}, ${r.cubierto}, ${r.descubierto}, ${r.ocTotal}, now())`,
      );
      await prisma.$executeRaw`
        INSERT INTO preparado.faltante_oc_consumo
          (fecha, "codArticulo", faltan, "ocImputada", descubierto, "ocTotal", "updatedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT (fecha, "codArticulo") DO UPDATE SET
          faltan       = EXCLUDED.faltan,
          "ocImputada" = EXCLUDED."ocImputada",
          descubierto  = EXCLUDED.descubierto,
          "ocTotal"    = EXCLUDED."ocTotal",
          "updatedAt"  = now()
      `;
    } catch (e) {
      consumoWarn = true;
      console.error("persist faltante_oc_consumo", e);
    }
  }

  return NextResponse.json({
    fecha,
    desde: minPrimer ?? fecha,
    hasta: maxFecha ?? fecha,
    total: rowsOut.length,
    rows: rowsOut,
    ocWarn,
    consumoWarn,
  });
}
