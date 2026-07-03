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
//   3. Se agrupa por (artículo, PrimerDia) → "lo nuevo de cada día" sin doble
//      contar (cada renglón cuenta una sola vez, en su día de aparición).
//   4. Por artículo, "faltan" se ACUMULA día a día (no se resetea): faltan[día] =
//      faltan[día-1] + nuevoDelDia. Se cubre contra la OC "por llegar" (Magnus,
//      en vivo). El día que llega la OC (fechaEntrega) y cubrió con sobrante, el
//      acumulado vuelve a 0 ese mismo día (no se arrastra crédito viejo); si NO
//      alcanzó a cubrir, el descubierto real sigue acumulando tal cual.
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
  Vivo?: number; // 1 = sigue pendiente; 0 = histórico ya entregado/cubierto
}
interface OcRow {
  CodArticulo: string;
  PorLlegar: number;
  Proveedor: string | null;
  FechaEntrega: string | null;
  Importacion: boolean;
  NroOCs: string[];
}
type Estado = "completo" | "incompleto" | "sin_orden" | "entregado";

interface Bucket {
  CodArticulo: string;
  Nombre: string;
  Linea: string | number | null;
  Proveedor: string | null;
  fecha: string; // PrimerDia (día del faltante)
  vivo: boolean; // false = histórico ya entregado/cubierto
  faltan: number; // acumulado (ver punto 4 más abajo), no solo lo nuevo del día
  nuevoDelDia: number; // lo que aportó puntualmente este día (sin acumular)
  importe: number;
  renglones: number;
  renglonesConArribo: number; // cuántos de los renglones ya tienen fechaArribo
  fechaArriboMin: string | null; // más vieja cargada entre esos renglones
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

// Fecha de corte del cruce: el FIFO arranca acá. Solo se consideran las OC hechas
// desde esta fecha y los faltantes que aparecen desde esta fecha, así una OC nueva
// no se "gasta" cubriendo faltantes viejos (de hace años). Override: ?ocDesde=YYYY-MM-DD.
const OC_DESDE_DEFAULT = "2026-06-26";

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
  // (?historico= ya no se usa: siempre se pide histórico, ver qs más abajo)
  // conArribo: por defecto oculta los buckets que ya tienen fecha de arribo
  // cargada (preparado.faltante_control) en TODOS sus renglones; con
  // conArribo=1 los vuelve a mostrar (para corroborar los que ya se pasaron).
  const conArribo = sp.get("conArribo") === "1" || sp.get("conArribo") === "true";
  // corte del cruce (faltantes y OC se anclan acá). Override opcional ?ocDesde=
  const ocDesde = sp.get("ocDesde") || OC_DESDE_DEFAULT;
  // La OC del 26 cubre faltantes del 25 en adelante → corte de faltantes = 1 día antes.
  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const faltDesde = sp.get("faltDesde") || addDays(ocDesde, -1);

  const qs = new URLSearchParams();
  if (desdeParam) qs.set("desde", desdeParam);
  if (hastaParam) qs.set("hasta", hastaParam);
  // SIEMPRE histórico: los renglones faltantes salen de Ven_PedRenPendientes
  // apenas se factura el pedido (viven ~1 snapshot). Sin histórico, la variante
  // "viva" exige estar en la última foto y se pierden los faltantes de días
  // anteriores. Lo marcado "sin existencia" es demanda vigente siempre (ver
  // agrupado, punto 3) — el param ?historico= del front quedó sin efecto.
  qs.set("historico", "1");
  const faltUrl = `${API_URL}/deposito/faltantes${qs.toString() ? `?${qs}` : ""}`;
  const ocUrl = `${API_URL}/compras/ordenes-pendientes?desde=${encodeURIComponent(ocDesde)}`;

  // 1) faltantes (obligatorio) + OC (best-effort) en paralelo
  const [faltRes, ocRes] = await Promise.allSettled([
    getJson(faltUrl),
    getJson(ocUrl),
  ]);

  if (faltRes.status !== "fulfilled") {
    return NextResponse.json(
      { error: "No se pudo leer faltantes", detail: String(faltRes.reason) },
      { status: 503 },
    );
  }
  const faltJson = faltRes.value;
  const fecha: string | null = faltJson.fecha ?? null;
  // Universo del cruce: solo faltantes que aparecen (PrimerDia) desde el corte.
  // Así el FIFO no arrastra faltantes viejos que la OC nueva no debería cubrir.
  const faltRows: FaltRow[] = (faltJson.rows ?? []).filter((it: FaltRow) => {
    const dia = it.PrimerDia ?? it.Fecha ?? fecha;
    return !dia || dia >= faltDesde;
  });

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

  // 2) marcas existencia=false (última marca por renglón).
  // OJO: la ventana arranca en el ANCLA (faltDesde), NO en minPrimer del rango
  // visible: un renglón que sigue pendiente hoy pudo marcarse "sin existencia"
  // días atrás (la marca se guarda con la fecha de aquel snapshot). Con rango
  // default hoy–hoy, minPrimer = ayer y esas marcas viejas quedaban afuera →
  // la vista aparecía vacía aunque los faltantes siguieran vivos.
  const sinExistencia = new Set<string>();
  const desdeMarks = faltDesde < (minPrimer ?? faltDesde) ? faltDesde : (minPrimer ?? faltDesde);
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

  // 2c) fechaArribo por renglón (preparado.faltante_control), para poder
  // ocultar de esta vista lo que ya está cargado (ver conArribo). Igual que
  // sinExistencia: se toma sobre el rango, sin exigir que la columna "fecha"
  // de faltante_control coincida con el PrimerDia del bucket — ver nota en
  // lib/faltantesArribo.ts sobre por qué esa columna es otra fecha.
  const arriboPorRenglon = new Map<string, string | null>();
  if (faltRows.length && desdeMarks && hastaMarks) {
    try {
      const ctrlRows = await prisma.$queryRaw<
        { nroPedOrigen: number; nroRengOrigen: number; fechaArribo: string | null }[]
      >`
        SELECT "nroPedOrigen", "nroRengOrigen",
               to_char("fechaArribo", 'YYYY-MM-DD') AS "fechaArribo"
        FROM preparado.faltante_control
        WHERE fecha BETWEEN ${new Date(desdeMarks)} AND ${new Date(hastaMarks)}
        ORDER BY "updatedAt" ASC
      `;
      for (const r of ctrlRows)
        if (r.fechaArribo) arriboPorRenglon.set(keyLine(r.nroPedOrigen, r.nroRengOrigen), r.fechaArribo);
    } catch (e) {
      console.error("read faltante_control (arribo)", e);
    }
  }

  // 2b) marcas extraordinario/comprar por (fecha, artículo) — best-effort: si la
  // tabla no está creada aún (prisma/sql/faltante_extraordinario.sql sin aplicar),
  // la vista sigue funcionando con todo en extraordinario=false.
  const keyArtDia = (cod: string, dia: string) => `${cod}__${dia}`;
  const extraMap = new Map<string, { extraordinario: boolean; comprar: boolean | null }>();
  // marca más nueva por artículo (fallback cuando el día del bucket "rodó" y
  // ya no coincide con la fecha guardada — mismo criterio que /ventas/faltantes,
  // que resuelve extraordinario solo por codArticulo).
  const extraUltPorArt = new Map<string, { extraordinario: boolean; comprar: boolean | null }>();
  let extraWarn = false;
  if (faltRows.length && desdeMarks && hastaMarks) {
    try {
      const extraRows = await prisma.$queryRaw<
        { fecha: Date; codArticulo: string; extraordinario: boolean; comprar: boolean | null }[]
      >`
        SELECT fecha, "codArticulo", extraordinario, comprar
        FROM preparado.faltante_extraordinario
        WHERE fecha BETWEEN ${new Date(desdeMarks)} AND ${new Date(hastaMarks)}
        ORDER BY "updatedAt" ASC
      `;
      for (const e of extraRows) {
        const dia = e.fecha.toISOString().slice(0, 10);
        const val = {
          extraordinario: !!e.extraordinario,
          comprar: e.comprar === null ? null : !!e.comprar,
        };
        extraMap.set(keyArtDia(e.codArticulo, dia), val);
        extraUltPorArt.set(e.codArticulo, val); // asc → queda la más nueva
      }
    } catch (e) {
      extraWarn = true;
      console.error("read faltante_extraordinario", e);
    }
  }

  // 3) agrupar lo "sin existencia" por (artículo, primer día)
  const buckets = new Map<string, Bucket>();
  for (const it of faltRows) {
    if (!sinExistencia.has(keyLine(it.NroPedOrigen, it.NroRengOrigen))) continue;
    const cod = String(it.CodArticulo ?? "").trim();
    const dia = it.PrimerDia ?? it.Fecha ?? fecha ?? "";
    if (!cod || !dia) continue;
    // Todo renglón MARCADO "sin existencia" es demanda vigente aunque Vivo=0:
    // que haya salido de Ven_PedRenPendientes solo significa que el pedido se
    // facturó (sin el artículo), no que el faltante se haya resuelto. Sale del
    // circuito por OC que cubre / fechaArribo / extraordinario, no por Magnus.
    const vivo = true;
    const k = `${cod}__${dia}__v`;
    let b = buckets.get(k);
    if (!b) {
      b = {
        CodArticulo: cod,
        Nombre: it.Nombre,
        Linea: it.Linea ?? null,
        Proveedor: it.Proveedor,
        fecha: dia,
        vivo,
        faltan: 0,
        nuevoDelDia: 0,
        importe: 0,
        renglones: 0,
        renglonesConArribo: 0,
        fechaArriboMin: null,
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
    b.nuevoDelDia += it.CantPend || 0;
    b.importe += it.Importe || 0;
    b.renglones += 1;
    b.pedidos.add(it.NroPedOrigen);
    const arribo = arriboPorRenglon.get(keyLine(it.NroPedOrigen, it.NroRengOrigen));
    if (arribo) {
      b.renglonesConArribo += 1;
      if (!b.fechaArriboMin || arribo < b.fechaArriboMin) b.fechaArriboMin = arribo;
    }
    if (!b.Proveedor && it.Proveedor) b.Proveedor = it.Proveedor;
    if ((b.Linea === null || b.Linea === "") && it.Linea != null && it.Linea !== "")
      b.Linea = it.Linea;
  }

  // 4) por artículo: acumular el faltante día a día (no se resetea) y cubrirlo
  //    contra la OC "por llegar" (Magnus, en vivo).
  //
  //    · faltan (por día) = acumulado de todo lo que sigue sin existencia hasta
  //      ESE día (faltanAcum[día] = faltanAcum[día-1] + nuevoDelDia). Antes solo
  //      mostraba lo nuevo de cada día y por eso "se reseteaba".
  //    · La OC cubre ese acumulado (cubierto = min(acumulado, ocTotal)).
  //    · El día en que llega la OC (fechaEntrega) y quedó CUBIERTA con sobrante
  //      (descubierto = 0), ese sobrante no se arrastra: el acumulado vuelve a 0
  //      ese mismo día y el ciclo arranca de nuevo al día siguiente. Si en cambio
  //      NO alcanzó a cubrir (descubierto > 0), el descubierto real NO se
  //      resetea: sigue acumulando hasta que se cubra con una OC nueva.
  //    · Límite conocido: Magnus agrega todas las OC pendientes del artículo en
  //      un solo total con la fecha de entrega MÁS TEMPRANA (ver
  //      indicadores-api/compras.py:fetch_ordenes_pendientes). Si un artículo
  //      tiene 2+ OC activas con fechas distintas, hoy se tratan como 1 solo
  //      pool con 1 sola fecha de corte — no por-OC individual.
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
    const fechaEntrega = oc?.FechaEntrega ?? null;
    let acumulado = 0;
    let imp = 0;
    for (const b of arr) {
      imp += b.importe;
      if (!b.vivo) {
        // Histórico ya entregado: cubierto con stock, no consume la OC por llegar.
        b.cubierto = b.faltan;
        b.descubierto = 0;
        b.ocTotal = ocTotal;
        b.estado = "entregado";
        continue;
      }
      acumulado += b.nuevoDelDia;
      let cub = Math.min(Math.max(ocTotal, 0), acumulado);
      let desc = Math.max(acumulado - ocTotal, 0);

      // Llega la OC hoy y cubrió con sobrante → se descarta el crédito, no sigue
      // a favor para el próximo ciclo. Si no alcanzó, el descubierto queda como está.
      if (fechaEntrega && b.fecha === fechaEntrega && desc <= 0) {
        acumulado = 0;
        cub = 0;
        desc = 0;
      }

      b.faltan = r2(acumulado); // acumulado (ya reseteado arriba si correspondía)
      b.cubierto = cub;
      b.descubierto = desc;
      b.ocTotal = ocTotal;
      if (oc) {
        b.fechaEntrega = fechaEntrega;
        b.importacion = !!oc.Importacion;
        b.ocs = oc.NroOCs ?? [];
        if (!b.Proveedor && oc.Proveedor) b.Proveedor = oc.Proveedor;
      }
      b.estado =
        b.faltan > 0 && b.descubierto <= 0 ? "completo" : cub > 0 ? "incompleto" : "sin_orden";
    }
    artImporte.set(cod, imp);
  }

  // 5) ordenar: artículos por importe total desc, días asc dentro del artículo.
  //    conArribo=0 (default): oculta buckets con TODOS sus renglones ya con
  //    fecha de arribo cargada (preparado.faltante_control) — ya están
  //    resueltos para compras. conArribo=1 los vuelve a mostrar, para
  //    corroborar los que ya se pasaron.
  const rowsOut = [...buckets.values()]
    .filter((b) => conArribo || b.renglones === 0 || b.renglonesConArribo < b.renglones)
    .sort((a, c) => {
      const ia = artImporte.get(a.CodArticulo) ?? 0;
      const ic = artImporte.get(c.CodArticulo) ?? 0;
      if (ic !== ia) return ic - ia;
      if (a.CodArticulo !== c.CodArticulo) return a.CodArticulo < c.CodArticulo ? -1 : 1;
      return a.fecha < c.fecha ? -1 : a.fecha > c.fecha ? 1 : 0;
    })
    .map((b) => {
      // exact-match por (artículo, día del bucket) y, si no hay (el PrimerDia
      // del bucket depende del rango consultado — con rango corto "rueda" y ya
      // no coincide con la fecha con la que se guardó la marca), fallback a la
      // marca más nueva del artículo.
      const mark =
        extraMap.get(keyArtDia(b.CodArticulo, b.fecha)) ??
        extraUltPorArt.get(b.CodArticulo);
      return {
        CodArticulo: b.CodArticulo,
        Nombre: b.Nombre,
        Linea: b.Linea,
        Proveedor: b.Proveedor,
        fecha: b.fecha,
        vivo: b.vivo,
        faltan: r2(b.faltan), // acumulado hasta este día (ver punto 4)
        nuevoDelDia: r2(b.nuevoDelDia),
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
        extraordinario: mark?.extraordinario ?? false,
        comprar: mark?.comprar ?? null,
        fechaArribo: b.fechaArriboMin,
        tieneArribo: b.renglones > 0 && b.renglonesConArribo === b.renglones,
      };
    });

  // 6) persistir el consumo por día (best-effort; tabla aplicada a mano por SQL)
  //    Solo demanda viva: los entregados históricos no imputan OC.
  let consumoWarn = false;
  const consumoRows = rowsOut.filter((r) => r.vivo);
  if (consumoRows.length) {
    try {
      const values = consumoRows.map(
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
    ocDesde,
    faltDesde,
    historico: true, // siempre histórico (ver qs arriba)
    conArribo,
    total: rowsOut.length,
    rows: rowsOut,
    ocWarn,
    consumoWarn,
    extraWarn,
  });
}
