import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

// Ancla del cruce con OC — mismo corte que /compras/faltantes (OC_DESDE_DEFAULT
// en faltantes-consumo/route.ts). Mantener sincronizados.
const OC_DESDE = "2026-06-26";

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/faltantes — agrega server-side todo lo que necesita
//   /ventas/faltantes (Tabla 1 y Tabla 2). NO escribe nada acá; solo LEE:
//     · indicadores-api /deposito/faltantes      (renglones + fecha del día)
//     · indicadores-api /compras/ingresos         (remitos de ingreso x OC ya
//       concretados, agregado por artículo — solo para Tabla 2)
//     · preparado.faltante_existencia             (¿sin existencia?)
//     · preparado.faltante_control                (fechaArribo, clienteQuiere, vendido)
//     · preparado.faltante_extraordinario          (flag de COMPRAS, por
//       código de artículo — no se toca esa tabla, solo se consulta)
//     · indicadores-api /compras/ordenes-pendientes (OC "por llegar" de Magnus:
//       si el artículo tiene OC pendiente NO importación con FechaEntrega, esa
//       fecha vale como arribo AUTOMÁTICO; si NO hay FechaEntrega confiable
//       (Importacion=true), se estima como FechaOC (fecha de la OC) + 2 días;
//       la carga manual en /compras/faltantes — faltante_control — la PISA
//       cuando compras conoce la fecha real)
//
//   Tabla 1 — regla de entrada: sin existencia + clienteQuiere aún sin
//   responder + (ya tiene fecha de arribo [manual u OC] O [compras lo marcó
//   extraordinario Y el "comprar" de faltante_extraordinario todavía está sin
//   decidir]). La
//   decisión de comprar se toma acá mismo (ver decidir() en el page.tsx) y
//   apenas se decide, la fila deja de calificar por la vía extraordinario.
//
//   Tabla 2 ("listos", rows→listos) — regla de entrada (3 requisitos):
//     1) fechaArribo cargada (faltante_control)
//     2) clienteQuiere === true (faltante_control)
//     3) el artículo aparece en un remito de ingreso x OC con fecha >= a la
//        fecha del faltante (indicadores-api /compras/ingresos)
//   Sale de Tabla 2 apenas se decide "vendido" (true o false, cualquiera).
// ──────────────────────────────────────────────────────────────────────────────

interface FaltanteRow {
  NroPedOrigen: number;
  NroRengOrigen: number;
  CodArticulo: string;
  Nombre: string;
  CantPend: number;
  Cliente: number | string | null;
  ClienteNombre: string | null;
  Importe: number;
  Fecha: string | null;
}

export async function GET() {
  try {
    // Rango HISTÓRICO desde el ancla, NO el último snapshot: un renglón
    // faltante sale de Ven_PedRenPendientes apenas el pedido se factura
    // (vive ~1 día), así que con el snapshot del día se perdían todos los
    // faltantes de días anteriores aunque siguieran sin responder.
    const hoy = new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `${API_URL}/deposito/faltantes?desde=${OC_DESDE}&hasta=${hoy}&historico=1`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de depósito (faltantes)", detail },
        { status: res.status },
      );
    }
    const fj = await res.json();
    const rows: FaltanteRow[] = fj.rows ?? [];
    const fecha: string | null = fj.fecha ?? null;
    if (!fecha) return NextResponse.json({ fecha: null, rows: [] });

    const [existRows, ctrlRows, extraRows, ingresosJson, ocJson, wmsRows] = await Promise.all([
      // faltante_existencia SÍ tiene modelo Prisma (columnas reales snake_case,
      // mapeadas) → usar el client, no SQL crudo con comillas camelCase.
      // NO exact-match por fecha: la marca puede haberse escrito con la fecha
      // rolling del renglón (no necesariamente "hoy") — se toma la más nueva
      // por renglón, igual patrón que ctrlRows más abajo.
      prisma.faltante_existencia.findMany({
        where: { fecha: { lte: new Date(hoy) } },
        select: { nroPedOrigen: true, codArticulo: true, existencia: true, fecha: true },
        orderBy: { fecha: "asc" },
      }),
      prisma.$queryRaw<
        {
          nroPedOrigen: number;
          nroRengOrigen: number;
          codArticulo: string | null;
          fechaArribo: string | null;
          clienteQuiere: boolean | null;
          vendido: boolean | null;
          irrelevante: boolean | null;
          duplicado: boolean | null;
        }[]
      >`
        SELECT DISTINCT ON ("nroPedOrigen", "nroRengOrigen")
               "nroPedOrigen", "nroRengOrigen", "codArticulo",
               to_char("fechaArribo", 'YYYY-MM-DD') AS "fechaArribo",
               "clienteQuiere",
               "vendido",
               "irrelevante",
               "duplicado"
        FROM preparado.faltante_control
        ORDER BY "nroPedOrigen", "nroRengOrigen", "updatedAt" DESC
      `,
      prisma.$queryRaw<
        {
          codArticulo: string;
          extraordinario: boolean;
          comprar: boolean | null;
          fecha: Date;
        }[]
      >`
        SELECT DISTINCT ON ("codArticulo") "codArticulo", extraordinario, comprar, fecha
        FROM preparado.faltante_extraordinario
        ORDER BY "codArticulo", "updatedAt" DESC
      `,
      // Remitos de ingreso x OC desde la fecha del faltante (regla Tabla 2,
      // requisito 3). Si falla (SQL Server caído), Tabla 2 queda vacía pero
      // Tabla 1 sigue funcionando (no se corta el fetch principal).
      // desde el ancla (los faltantes ahora abarcan varios días, no un snapshot)
      fetch(`${API_URL}/compras/ingresos?desde=${OC_DESDE}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      })
        .then((r) => (r.ok ? r.json() : { rows: [] }))
        .catch(() => ({ rows: [] })),
      // OC pendientes (arribo automático). Best-effort: si falla, solo quedan
      // los arribos manuales de faltante_control.
      fetch(`${API_URL}/compras/ordenes-pendientes?desde=${OC_DESDE}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      })
        .then((r) => (r.ok ? r.json() : { rows: [] }))
        .catch(() => ({ rows: [] })),
      // Fallback para "con existencia" (enStock) cuando el renglón ya no
      // matchea en `rows` (Magnus, fuente vieja) — pasa cuando la marca viene
      // de WMS ot-diferencias (fuente real de faltante_existencia) y Magnus
      // ya no lo tiene pendiente. preparado.faltante_wms la persiste
      // automático GET /api/deposito/faltantes. Best-effort: la tabla puede
      // no existir aún en algún ambiente.
      prisma.$queryRaw<
        {
          nroPedOrigen: number | null;
          nroRengOrigen: number;
          codArticulo: string;
          nombre: string;
          cliente: string;
          cantPedida: unknown;
          importe: unknown;
          fecha: Date;
        }[]
      >`
        SELECT DISTINCT ON ("nroPedOrigen", "codArticulo")
               "nroPedOrigen", "nroRengOrigen", "codArticulo", nombre, cliente,
               "cantPedida", importe, fecha
        FROM preparado.faltante_wms
        ORDER BY "nroPedOrigen", "codArticulo", "updatedAt" DESC
      `.catch(() => []),
    ]);

    // Última marca de existencia por renglón (existRows viene asc por fecha,
    // sin exact-match — ver comentario arriba).
    // OJO clave: NroRengOrigen NO sirve acá. faltante_existencia se escribe desde
    // /deposito/faltantes (fuente WMS ot-diferencias) con nroRengOrigen =
    // OTItemNroRenglon (numeración interna de WMS), mientras que `rows` de acá
    // abajo viene del fetch_faltantes VIEJO (Magnus Ven_PedRenPendientes), cuyo
    // NroRengOrigen es el renglón real del pedido de venta — otra numeración,
    // mismo nombre de campo. NroPedOrigen (=NroMovVenta) sí coincide en ambas
    // fuentes, así que se cruza por NroPedOrigen+CodArticulo (trimeado). Bug real
    // encontrado 2026-07-10: por esto los renglones marcados "En exist." en
    // /deposito/faltantes no aparecían en /ventas/faltantes "Ingresados".
    const existLatest = new Map<string, boolean | null>();
    for (const r of existRows)
      existLatest.set(`${r.nroPedOrigen}-${(r.codArticulo ?? "").trim()}`, r.existencia);
    const sin = new Set<string>();
    for (const [k, ex] of existLatest) if (ex === false) sin.add(k);
    // existencia=true: fue error de preparado (SÍ había en depósito). No pasa
    // por compras — se muestra como "arribado" automático (fechaArribo
    // sintético "EN_STOCK") directo en Tabla 1 / Ingresados.
    const con = new Set<string>();
    for (const [k, ex] of existLatest) if (ex === true) con.add(k);

    type Ctrl = {
      fechaArribo: string | null;
      clienteQuiere: boolean | null;
      vendido: boolean | null;
      irrelevante: boolean | null;
      duplicado: boolean | null;
    };
    const ctrl = new Map<string, Ctrl>();
    // Fallback por (pedido, artículo) — sin exigir que NroRengOrigen coincida.
    // `rows` (más abajo) sale de una consulta FRESCA a /deposito/faltantes; la
    // fila se guardó en faltante_control con el NroRengOrigen vigente AL
    // MOMENTO de cargar el Arribo en /compras/faltantes (resolveBucketRenglones,
    // ver lib/faltantesArribo.ts). Si Ven_PedRenPendientes renumera el renglón
    // pendiente de un pedido multi-línea entre esa carga y esta lectura (p.ej.
    // porque otra línea del mismo pedido se facturó y el resto se corrió), el
    // match exacto por renglón falla aunque el dato SÍ esté en Postgres — mismo
    // patrón de bug ya encontrado y resuelto para "existencia" (ver keyArt en
    // /api/compras/faltantes-consumo, comentario "Bug real encontrado
    // 2026-07-10"). Solo se guarda acá lo que trae fechaArribo (lo único que
    // este fallback necesita cubrir).
    const ctrlPorArt = new Map<string, Ctrl>();
    for (const r of ctrlRows) {
      const val: Ctrl = {
        fechaArribo: r.fechaArribo,
        clienteQuiere: r.clienteQuiere,
        vendido: r.vendido,
        irrelevante: r.irrelevante,
        duplicado: r.duplicado,
      };
      ctrl.set(`${r.nroPedOrigen}-${r.nroRengOrigen}`, val);
      const cod = (r.codArticulo ?? "").trim();
      if (cod && val.fechaArribo) ctrlPorArt.set(`${r.nroPedOrigen}-${cod}`, val);
    }

    // Arribo automático por OC: artículo → FechaEntrega de la OC pendiente,
    // salvo importación (sin fecha confiable) — en ese caso se estima como
    // FechaOC (fecha en que se hizo la orden, FecMovim) + 2 días. Manual
    // (faltante_control) pisa cualquiera de los dos casos.
    const ocArribo = new Map<string, string>();
    for (const r of (ocJson?.rows ?? []) as {
      CodArticulo?: string;
      FechaEntrega?: string | null;
      FechaOC?: string | null;
      Importacion?: boolean;
    }[]) {
      const cod = String(r.CodArticulo ?? "").trim();
      if (!cod) continue;
      if (r.FechaEntrega && !r.Importacion) {
        ocArribo.set(cod, r.FechaEntrega);
      } else if (r.FechaOC) {
        const d = new Date(`${r.FechaOC}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 2);
        ocArribo.set(cod, d.toISOString().slice(0, 10));
      }
    }

    // Artículos con remito de ingreso x OC ya concretado (Tabla 2, requisito 3).
    const ingresados = new Set<string>(
      (ingresosJson?.rows ?? [])
        .map((r: { CodArticulo?: string }) =>
          String(r.CodArticulo ?? "").trim(),
        )
        .filter(Boolean),
    );

    // Por artículo: solo mientras comprar esté sin decidir (null). Apenas
    // compras/ventas lo resuelve (true o false), deja de calificar acá.
    const extraMap = new Map<
      string,
      { comprar: boolean | null; fecha: string }
    >();
    for (const r of extraRows)
      if (r.extraordinario)
        extraMap.set(r.codArticulo, {
          comprar: r.comprar,
          fecha: r.fecha.toISOString().slice(0, 10),
        });

    // Última fila WMS (faltante_wms) por nroPedOrigen+codArticulo — fallback
    // de enStock cuando el renglón "con existencia" no matchea en `rows`
    // (Magnus).
    const wmsLatest = new Map<
      string,
      {
        nroPedOrigen: number;
        nroRengOrigen: number;
        codArticulo: string;
        nombre: string;
        cliente: string;
        cantPedida: number;
        importe: number;
        fecha: string;
      }
    >();
    for (const r of wmsRows) {
      if (r.nroPedOrigen === null) continue;
      const cod = (r.codArticulo ?? "").trim();
      wmsLatest.set(`${r.nroPedOrigen}-${cod}`, {
        nroPedOrigen: r.nroPedOrigen,
        nroRengOrigen: r.nroRengOrigen,
        codArticulo: cod,
        nombre: r.nombre ?? "",
        cliente: r.cliente ?? "",
        cantPedida: Number(r.cantPedida ?? 0),
        importe: Number(r.importe ?? 0),
        fecha:
          r.fecha instanceof Date
            ? r.fecha.toISOString().slice(0, 10)
            : String(r.fecha).slice(0, 10),
      });
    }

    const out = rows
      .filter((r) => sin.has(`${r.NroPedOrigen}-${r.CodArticulo.trim()}`))
      // irrelevante (botón basurero, Tabla 1): descarte definitivo, no vuelve
      // a entrar aunque clienteQuiere siga en null.
      .filter(
        (r) => !ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`)?.irrelevante,
      )
      // duplicado: factura duplicada (botón "Duplicado"), descarte definitivo
      // igual que irrelevante — no vuelve a entrar.
      .filter(
        (r) => !ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`)?.duplicado,
      )
      .map((r) => {
        const cExact = ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`);
        const cArt = ctrlPorArt.get(`${r.NroPedOrigen}-${r.CodArticulo.trim()}`);
        const c = cExact ?? cArt;
        const extra = extraMap.get(r.CodArticulo);
        const extraordinario = !!extra && extra.comprar === null;
        // fechaArribo por separado de `c`: el match exacto por renglón puede
        // EXISTIR (ctrl se llena para TODO renglón, tenga o no arribo — hace
        // falta para clienteQuiere/irrelevante/duplicado) pero con
        // fechaArribo=null si ese renglón quedó reciclado por Magnus para OTRO
        // artículo. Si usáramos `c?.fechaArribo` (objeto completo con ??), ese
        // null exacto tapaba el fallback por artículo (cArt) aunque cArt SÍ
        // tuviera el arribo cargado — la fila caía al estimado de OC (badge
        // "OC", el que se ve como "fecha de despacho") en vez del manual.
        // Bug real 2026-07-24: /compras/faltantes con arribo cargado, /ventas
        // /faltantes seguía mostrando el estimado incluso después de deployar.
        const manual = cExact?.fechaArribo ?? cArt?.fechaArribo ?? null;
        return {
          ...r,
          fechaArribo: manual ?? ocArribo.get(r.CodArticulo.trim()) ?? null,
          arriboOC: !manual && ocArribo.has(r.CodArticulo.trim()),
          clienteQuiere: c?.clienteQuiere ?? null,
          extraordinario,
          extraordinarioFecha: extra?.fecha ?? null,
        };
      })
      .filter(
        (r) =>
          r.clienteQuiere === null &&
          (r.fechaArribo !== null || r.extraordinario),
      );

    // Tabla 2: sin existencia + clienteQuiere=true + fechaArribo + ya llegó por
    // remito (CodArticulo en /compras/ingresos) + vendido aún sin decidir.
    const listos = rows
      .filter((r) => sin.has(`${r.NroPedOrigen}-${r.CodArticulo.trim()}`))
      .map((r) => {
        const cExact = ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`);
        const cArt = ctrlPorArt.get(`${r.NroPedOrigen}-${r.CodArticulo.trim()}`);
        const c = cExact ?? cArt;
        return {
          ...r,
          // mismo fallback OC que Tabla 1 (por si el POST de control no
          // persistió la fecha al responder clienteQuiere). fechaArribo mira
          // cExact y cArt por separado — ver comentario en Tabla 1 arriba
          // (mismo bug: objeto exacto con fechaArribo=null tapaba el fallback).
          fechaArribo:
            cExact?.fechaArribo ?? cArt?.fechaArribo ?? ocArribo.get(r.CodArticulo.trim()) ?? null,
          clienteQuiere: c?.clienteQuiere ?? null,
          vendido: c?.vendido ?? null,
          yaIngreso: ingresados.has(r.CodArticulo.trim()),
        };
      })
      .filter(
        (r) =>
          r.clienteQuiere === true &&
          r.fechaArribo !== null &&
          r.yaIngreso &&
          r.vendido === null,
      );

    // existencia=true: error de preparado, no pasa por compras. "Arribado"
    // automático con fechaArribo sintético = "EN_STOCK" (ver fmtAr en el
    // front). Mismo gate de salida que Tabla 1 (clienteQuiere aún null).
    //
    // `con` viene de faltante_existencia, cuya fuente REAL es WMS
    // ot-diferencias (pedida≠cumplida en la OT) — NO Magnus. `rows` acá abajo
    // sigue siendo Magnus (fetch_faltantes viejo): un renglón "con existencia"
    // puede no tener match ahí (ya facturado / fuera de la ventana OC_DESDE en
    // Magnus) aunque WMS sí lo haya marcado hoy. Por eso arma en dos pasadas:
    // primero desde `rows` cuando matchea (dato real de Magnus); lo que queda
    // sin match se arma desde preparado.faltante_wms — Nombre resuelto (join
    // StkFer_Articulos en indicadores-api) e Importe APROXIMADO (último
    // PrecioVenta visto para ese CodArticulo en cualquier pedido de
    // Ven_PedRenPendientes, no hay tabla de lista de precios en el proyecto).
    const conKeysConRow = new Set<string>();
    const enStockDeRows = rows
      .filter((r) => {
        const k = `${r.NroPedOrigen}-${r.CodArticulo.trim()}`;
        if (!con.has(k)) return false;
        conKeysConRow.add(k);
        return true;
      })
      .filter(
        (r) => !ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`)?.irrelevante,
      )
      // duplicado: factura duplicada (botón "Duplicado"), descarte definitivo
      // igual que irrelevante — no vuelve a entrar.
      .filter(
        (r) => !ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`)?.duplicado,
      )
      .map((r) => {
        const c = ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`);
        return {
          ...r,
          fechaArribo: "EN_STOCK" as const,
          arriboOC: false,
          clienteQuiere: c?.clienteQuiere ?? null,
          extraordinario: false,
          extraordinarioFecha: null,
        };
      })
      .filter((r) => r.clienteQuiere === null);

    const enStockDeWms: typeof enStockDeRows = [];
    for (const [key, ex] of existLatest) {
      if (ex !== true || conKeysConRow.has(key)) continue;
      const w = wmsLatest.get(key);
      if (!w) continue; // ni Magnus ni faltante_wms lo tienen — no hay con qué mostrarlo
      const c = ctrl.get(`${w.nroPedOrigen}-${w.nroRengOrigen}`);
      if (c?.irrelevante || c?.duplicado) continue;
      if ((c?.clienteQuiere ?? null) !== null) continue;
      enStockDeWms.push({
        NroPedOrigen: w.nroPedOrigen,
        NroRengOrigen: w.nroRengOrigen,
        CodArticulo: w.codArticulo,
        Nombre: w.nombre,
        CantPend: w.cantPedida,
        Cliente: w.cliente || null,
        ClienteNombre: w.cliente || null,
        Importe: w.importe,
        Fecha: w.fecha,
        fechaArribo: "EN_STOCK" as const,
        arriboOC: false,
        clienteQuiere: null,
        extraordinario: false,
        extraordinarioFecha: null,
      });
    }

    const enStock = [...enStockDeRows, ...enStockDeWms];

    return NextResponse.json({ fecha, rows: [...out, ...enStock], listos });
  } catch (error) {
    console.error("GET /api/ventas/faltantes", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
