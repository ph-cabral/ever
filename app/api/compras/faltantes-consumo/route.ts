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
//      faltan[día-1] + nuevoDelDia. Se cubre contra DOS fuentes en VIVO (no
//      estimaciones, no la fecha manual de "Arribo"): la OC "por llegar"
//      (Magnus, ya neta de lo recibido) y el stock físico real del depósito 1
//      (WMS, ver /deposito/stock-por-articulos). Cualquier día que esas dos
//      fuentes juntas alcancen a cubrir todo el acumulado, se descarta el
//      crédito (no se arrastra sobrante a favor) y el artículo vuelve a foja
//      cero para el próximo ciclo. Si no alcanzan, el descubierto real sigue
//      acumulando tal cual.
//   4b. Color/visibilidad de cada bucket "vivo" (2026-07-27, 4 casos, en orden):
//      · stock SOLO (sin la OC) ya cubre el acumulado → NO es problema de
//        compras: el bucket se EXCLUYE de la respuesta (desaparece de toda
//        la vista, ver resueltoPorStock).
//      · si no, pero OC+stock juntos cubren todo (descubierto=0) → estado
//        "completo", SE MUESTRA en verde (antes también se ocultaba; ahora
//        solo se oculta el caso de arriba, resuelto por stock puro).
//      · si no, y hay algo de OC pendiente (cub>0) → "incompleto", rojo.
//      · si no hay OC en absoluto → "sin_orden", SIN COLOR (antes rojo).
//      El histórico "entregado" no pasa por ninguna de estas reglas (tiene
//      su propio verde, fijo).
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
  Cliente: string | number | null;
  ClienteNombre: string | null;
  Fecha: string | null; // snapshot más nuevo del renglón en el rango
  PrimerDia: string | null; // primera aparición en el rango
  Vivo?: number; // 1 = sigue pendiente; 0 = histórico ya entregado/cubierto
  TipoArticulo?: string | null; // "Nacional"/"Importado"/"Fabrica" (StkFer_Articulos.NacionalImportado, Magnus) o "" si no está cargado
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
  clientes: Map<string, { nombre: string | null; cant: number }>;
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
  tipoArticulo: string | null; // "Nacional"/"Importado"/"Fabrica" (Magnus, StkFer_Articulos.NacionalImportado) — ver clasificación Importados/Nacionales en el front
  ocs: string[];
  estado: Estado;
  stock: number; // existencia real en depósito 1 (WMS, en vivo) — ver /deposito/stock
  resueltoPorStock: boolean; // el STOCK SOLO (sin la OC) ya cubre todo el acumulado — se excluye de la respuesta (ver punto 4b), no llega al front
}

const keyLine = (p: number, r: number) => `${p}-${r}`;
// Clave para cruzar contra faltante_existencia (fuente WMS ot-diferencias):
// NroRengOrigen ahí es OTItemNroRenglon (numeración WMS), distinta del renglón
// real de Ven_PedRenPendientes que trae `faltRows` (fetch_faltantes viejo,
// Magnus) — mismo nombre de campo, otra numeración. NroPedOrigen (=NroMovVenta)
// sí coincide en ambas fuentes, así que se cruza por pedido+artículo (trimeado).
// Bug real encontrado 2026-07-10 (mismo que /api/ventas/faltantes): con
// keyLine (por renglón) los "en existencia" marcados en /deposito/faltantes no
// aparecían del lado de ventas/compras.
const keyArt = (p: number, cod: string) => `${p}-${cod.trim()}`;
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
      select: { nroPedOrigen: true, codArticulo: true, existencia: true, fecha: true },
      orderBy: { fecha: "asc" },
    });
    const latest = new Map<string, boolean>();
    for (const m of marks)
      latest.set(keyArt(m.nroPedOrigen, m.codArticulo ?? ""), m.existencia);
    for (const [k, ex] of latest) if (ex === false) sinExistencia.add(k);
  }

  // 2c) fechaArribo por renglón (preparado.faltante_control), para poder
  // ocultar de esta vista lo que ya está cargado (ver conArribo). Igual que
  // sinExistencia: NO se filtra por la columna "fecha" de faltante_control —
  // ver nota en lib/faltantesArribo.ts sobre por qué esa columna es otra
  // fecha (el snapshot vigente AL MOMENTO de cargar el Arribo, no el
  // PrimerDia del bucket). Antes acotaba con WHERE fecha BETWEEN
  // desdeMarks/hastaMarks: un bucket viejo (PrimerDia de hace semanas, caso
  // típico acá porque "faltan" es acumulado) puede haber guardado su Arribo
  // con una "fecha" fuera de esa ventana y quedaba afuera — mismo bug que
  // /api/ventas/faltantes (ver ctrlPorArt ahí).
  //
  // Match primario por renglón (nroPedOrigen+nroRengOrigen) y fallback por
  // (nroPedOrigen+CodArticulo) — arriboPorRenglonArt — para el caso en que
  // Ven_PedRenPendientes renumeró el renglón pendiente entre la carga en
  // /compras/faltantes y esta lectura (pedidos con varias líneas). Mismo
  // patrón que keyArt ya usa acá para sinExistencia.
  const arriboPorRenglon = new Map<string, string | null>();
  const arriboPorRenglonArt = new Map<string, string | null>();
  if (faltRows.length) {
    try {
      const ctrlRows = await prisma.$queryRaw<
        {
          nroPedOrigen: number;
          nroRengOrigen: number;
          codArticulo: string | null;
          fechaArribo: string | null;
        }[]
      >`
        SELECT "nroPedOrigen", "nroRengOrigen", "codArticulo",
               to_char("fechaArribo", 'YYYY-MM-DD') AS "fechaArribo"
        FROM preparado.faltante_control
        ORDER BY "updatedAt" ASC
      `;
      for (const r of ctrlRows) {
        if (!r.fechaArribo) continue;
        arriboPorRenglon.set(keyLine(r.nroPedOrigen, r.nroRengOrigen), r.fechaArribo);
        const cod = (r.codArticulo ?? "").trim();
        if (cod) arriboPorRenglonArt.set(keyArt(r.nroPedOrigen, cod), r.fechaArribo);
      }
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

  // 2d) marcas "descartar" por (fecha, artículo) — igual criterio que extraMap
  // (match exacto + fallback a la más nueva del artículo, porque el día del
  // bucket "rueda" según el rango consultado). Best-effort: si la tabla no
  // está creada aún (prisma/sql/faltante_descartado.sql sin aplicar), la vista
  // sigue funcionando sin descartar nada. NO borra ninguna fila de ninguna
  // tabla: solo se usa para excluir el bucket de la respuesta (ver filtro más
  // abajo), por eso no aparece en ninguna tabla de la vista (principal,
  // agrupada por proveedor ni extraordinarios).
  const descartMap = new Map<string, boolean>();
  const descartUltPorArt = new Map<string, boolean>();
  let descartWarn = false;
  if (faltRows.length && desdeMarks && hastaMarks) {
    try {
      const descartRows = await prisma.$queryRaw<
        { fecha: Date; codArticulo: string; descartado: boolean }[]
      >`
        SELECT fecha, "codArticulo", descartado
        FROM preparado.faltante_descartado
        WHERE fecha BETWEEN ${new Date(desdeMarks)} AND ${new Date(hastaMarks)}
        ORDER BY "updatedAt" ASC
      `;
      for (const d of descartRows) {
        const dia = d.fecha.toISOString().slice(0, 10);
        const val = !!d.descartado;
        descartMap.set(keyArtDia(d.codArticulo, dia), val);
        descartUltPorArt.set(d.codArticulo, val); // asc → queda la más nueva
      }
    } catch (e) {
      descartWarn = true;
      console.error("read faltante_descartado", e);
    }
  }

  // 3) agrupar lo "sin existencia" por (artículo, primer día)
  const buckets = new Map<string, Bucket>();
  for (const it of faltRows) {
    const cod = String(it.CodArticulo ?? "").trim();
    if (!sinExistencia.has(keyArt(it.NroPedOrigen, cod))) continue;
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
        clientes: new Map(),
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
        tipoArticulo: (it.TipoArticulo || "").trim() || null,
        ocs: [],
        estado: "sin_orden",
        stock: 0,
        resueltoPorStock: false,
      };
      buckets.set(k, b);
    }
    b.faltan += it.CantPend || 0;
    b.nuevoDelDia += it.CantPend || 0;
    b.importe += it.Importe || 0;
    b.renglones += 1;
    b.pedidos.add(it.NroPedOrigen);
    const codCli = it.Cliente != null && it.Cliente !== "" ? String(it.Cliente) : null;
    if (codCli) {
      const prevCli = b.clientes.get(codCli);
      if (prevCli) prevCli.cant += it.CantPend || 0;
      else b.clientes.set(codCli, { nombre: it.ClienteNombre ?? null, cant: it.CantPend || 0 });
    }
    const arribo =
      arriboPorRenglon.get(keyLine(it.NroPedOrigen, it.NroRengOrigen)) ??
      arriboPorRenglonArt.get(keyArt(it.NroPedOrigen, cod));
    if (arribo) {
      b.renglonesConArribo += 1;
      if (!b.fechaArriboMin || arribo < b.fechaArriboMin) b.fechaArriboMin = arribo;
    }
    if (!b.Proveedor && it.Proveedor) b.Proveedor = it.Proveedor;
    if (!b.tipoArticulo && it.TipoArticulo) b.tipoArticulo = it.TipoArticulo.trim() || null;
    if ((b.Linea === null || b.Linea === "") && it.Linea != null && it.Linea !== "")
      b.Linea = it.Linea;
  }

  // 4) por artículo: acumular el faltante día a día (no se resetea) y cubrirlo
  //    contra DOS fuentes reales (no estimaciones): la OC "por llegar" (Magnus,
  //    en vivo, ya neta de lo recibido) y el stock físico actual del depósito 1
  //    (WMS, en vivo — ver stockMap más abajo).
  //
  //    · faltan (por día) = acumulado de todo lo que sigue sin existencia hasta
  //      ESE día (faltanAcum[día] = faltanAcum[día-1] + nuevoDelDia). Antes solo
  //      mostraba lo nuevo de cada día y por eso "se reseteaba".
  //    · La OC cubre ese acumulado primero (cubierto = min(acumulado, ocTotal));
  //      lo que la OC no llega a cubrir, se neta contra el stock físico actual.
  //    · Cualquier día que esa cobertura real (OC + stock) llegue a cubrir TODO
  //      el acumulado, se descarta: no se arrastra sobrante a favor del próximo
  //      ciclo, el artículo vuelve a foja cero (antes esto solo pasaba el día
  //      EXACTO de "fechaEntrega"; ahora aplica cualquier día, sea por OC, por
  //      stock, o la suma de ambos). Si no alcanza, el descubierto real NO se
  //      resetea: sigue acumulando hasta que se cubra de verdad.
  //    · Un artículo que quedó en 0 (cubierto de verdad): si necesitó la OC
  //      para llegar a 0 (el stock solo no alcanzaba), NO se excluye — se
  //      manda con estado "completo" (fondo verde) para que quede a la vista
  //      que se resolvió. Si en cambio el STOCK SOLO ya alcanzaba (la OC no
  //      hizo falta), SÍ se excluye (ver resueltoPorStock/punto 4b): no es un
  //      problema de compras, desaparece de la vista. La fecha manual de
  //      "Arribo" NO interviene en ninguno de los dos casos, solo la
  //      cobertura real (OC/stock en vivo).
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

  // 3b) stock real del depósito 1 (WMS, en vivo) para los artículos en pantalla
  // (mismo dato que /deposito/stock). Si ya está físicamente en depósito, el
  // faltante se puede dar por cubierto sin esperar una OC — ver más abajo.
  // Best-effort: si el servicio no responde, sigue funcionando con stock=0
  // (se comporta igual que antes de este cambio).
  let stockWarn = false;
  const stockMap = new Map<string, number>();
  const codigosUnicos = [...porArt.keys()];
  if (codigosUnicos.length) {
    try {
      const stockUrl = `${API_URL}/deposito/stock-por-articulos?codigos=${encodeURIComponent(codigosUnicos.join(","))}`;
      const stockJson = await getJson(stockUrl);
      for (const r of (stockJson.rows ?? []) as { CodArticulo: string; Stock: number }[]) {
        const cod = String(r.CodArticulo ?? "").trim();
        if (cod) stockMap.set(cod, r.Stock || 0);
      }
    } catch (e) {
      stockWarn = true;
      console.error("read stock-por-articulos", e);
    }
  }

  const artImporte = new Map<string, number>();
  for (const [cod, arr] of porArt) {
    arr.sort((a, c) => (a.fecha < c.fecha ? -1 : a.fecha > c.fecha ? 1 : 0));
    const oc = ocMap.get(cod);
    const ocTotal = oc?.PorLlegar ?? 0;
    const fechaEntrega = oc?.FechaEntrega ?? null;
    const stock = stockMap.get(cod) ?? 0;
    let acumulado = 0;
    let imp = 0;
    for (const b of arr) {
      imp += b.importe;
      b.stock = stock;
      if (!b.vivo) {
        // Histórico ya entregado: cubierto con stock, no consume la OC por llegar.
        b.cubierto = b.faltan;
        b.descubierto = 0;
        b.ocTotal = ocTotal;
        b.estado = "entregado";
        continue;
      }
      acumulado += b.nuevoDelDia;
      // Acumulado de HOY antes de cualquier reset — se usa para decidir si el
      // STOCK SOLO (sin la OC) ya alcanza a cubrirlo (ver resueltoPorStock).
      const acumuladoDelDia = acumulado;
      let cub = Math.min(Math.max(ocTotal, 0), acumulado);
      let desc = Math.max(acumulado - ocTotal, 0);
      // El stock físico del depósito 1 (en vivo, WMS) tapa lo que la OC no
      // cubrió: si ya está en depósito no hace falta esperar una orden de compra.
      let descNetoStock = Math.max(desc - stock, 0);

      // El STOCK SOLO (sin contar ninguna OC) ya cubre todo el acumulado de
      // hoy: no es un problema de compras (no hace falta encargar nada), así
      // que este bucket se excluye más abajo en vez de pintarse — desaparece
      // de la tabla en lugar de quedar verde o neutro.
      const resueltoPorStock = stock >= acumuladoDelDia;

      // Cobertura REAL de hoy (OC pendiente actual + stock físico actual, las
      // dos en vivo — no la fecha manual de "Arribo" ni ninguna estimación):
      // si ya alcanza para cubrir TODO el acumulado, se descarta el crédito
      // — no se arrastra sobrante a favor del próximo ciclo, el artículo
      // vuelve a foja cero. Antes esto solo pasaba el día EXACTO de
      // "fechaEntrega"; ahora aplica cualquier día que la cobertura real
      // (por OC, por stock o la suma de ambos) llegue a 0. Si no alcanza, el
      // descubierto real NO se resetea: sigue acumulando tal cual.
      if (descNetoStock <= 0) {
        acumulado = 0;
        cub = 0;
        desc = 0;
        descNetoStock = 0;
      }

      b.faltan = r2(acumulado); // acumulado (ya reseteado arriba si correspondía)
      b.cubierto = cub;
      b.descubierto = r2(descNetoStock);
      b.ocTotal = ocTotal;
      b.resueltoPorStock = resueltoPorStock;
      if (oc) {
        b.fechaEntrega = fechaEntrega;
        b.importacion = !!oc.Importacion;
        b.ocs = oc.NroOCs ?? [];
        if (!b.Proveedor && oc.Proveedor) b.Proveedor = oc.Proveedor;
      }
      // 4 estados (2026-07-27, pedido explícito de Pablo):
      //   · descNetoStock<=0 (OC+stock cubren TODO)     → "completo" (verde).
      //     Si además resueltoPorStock (el STOCK SOLO ya alcanzaba, sin
      //     necesitar la OC), el filtro de más abajo lo saca de la
      //     respuesta — desaparece en vez de quedar verde.
      //   · si no, cub>0 (hay algo de OC pero no alcanza ni con el stock)
      //     → "incompleto" (rojo).
      //   · si no (no hay OC y el stock tampoco alcanza)  → "sin_orden"
      //     (sin color — antes rojo, ver rowCls en page.tsx).
      b.estado = descNetoStock <= 0 ? "completo" : cub > 0 ? "incompleto" : "sin_orden";
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
    .filter((b) => {
      const descartado =
        descartMap.get(keyArtDia(b.CodArticulo, b.fecha)) ?? descartUltPorArt.get(b.CodArticulo);
      return !descartado;
    })
    // Resuelto por STOCK SOLO (sin la OC, ver resueltoPorStock más arriba):
    // no es un problema de compras, no hace falta encargar nada — esta fila
    // SÍ se excluye (desaparece de toda la vista). Distinto de "completo" a
    // secas (OC+stock cubren todo pero el stock por sí solo NO alcanzaba):
    // ese caso NO se excluye más abajo, se manda con estado "completo" y se
    // pinta verde (cambio 2026-07-27, antes también se ocultaba).
    .filter((b) => !(b.estado === "completo" && b.resueltoPorStock))
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
        clientes: Array.from(b.clientes, ([cod, v]) => ({ cod, nombre: v.nombre, cant: r2(v.cant) })),
        fecha: b.fecha,
        vivo: b.vivo,
        faltan: r2(b.faltan), // acumulado hasta este día (ver punto 4)
        nuevoDelDia: r2(b.nuevoDelDia),
        cubierto: r2(b.cubierto),
        descubierto: r2(b.descubierto),
        importe: r2(b.importe),
        renglones: b.renglones,
        pedidos: b.pedidos.size,
        stock: r2(b.stock),
        ocTotal: r2(b.ocTotal),
        fechaEntrega: b.fechaEntrega,
        importacion: b.importacion,
        tipoArticulo: b.tipoArticulo,
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
    stockWarn,
    descartWarn,
  });
}
