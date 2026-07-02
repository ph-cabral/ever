import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

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
//
//   Tabla 1 — regla de entrada: sin existencia + clienteQuiere aún sin
//   responder + (ya tiene fecha de arribo O [compras lo marcó extraordinario Y
//   el "comprar" de faltante_extraordinario todavía está sin decidir]). La
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
    const res = await fetch(`${API_URL}/deposito/faltantes`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
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

    const [existRows, ctrlRows, extraRows, ingresosJson] = await Promise.all([
      // faltante_existencia SÍ tiene modelo Prisma (columnas reales snake_case,
      // mapeadas) → usar el client, no SQL crudo con comillas camelCase.
      // NO exact-match por fecha: la marca puede haberse escrito con la fecha
      // rolling del renglón (no necesariamente "hoy") — se toma la más nueva
      // por renglón, igual patrón que ctrlRows más abajo.
      prisma.faltante_existencia.findMany({
        where: { fecha: { lte: new Date(fecha) } },
        select: { nroPedOrigen: true, nroRengOrigen: true, existencia: true, fecha: true },
        orderBy: { fecha: "asc" },
      }),
      prisma.$queryRaw<
        {
          nroPedOrigen: number;
          nroRengOrigen: number;
          fechaArribo: string | null;
          clienteQuiere: boolean | null;
          vendido: boolean | null;
        }[]
      >`
        SELECT DISTINCT ON ("nroPedOrigen", "nroRengOrigen")
               "nroPedOrigen", "nroRengOrigen",
               to_char("fechaArribo", 'YYYY-MM-DD') AS "fechaArribo",
               "clienteQuiere",
               "vendido"
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
      fetch(`${API_URL}/compras/ingresos?desde=${fecha}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      })
        .then((r) => (r.ok ? r.json() : { rows: [] }))
        .catch(() => ({ rows: [] })),
    ]);

    // Última marca de existencia por renglón (existRows viene asc por fecha,
    // sin exact-match — ver comentario arriba).
    const existLatest = new Map<string, boolean | null>();
    for (const r of existRows)
      existLatest.set(`${r.nroPedOrigen}-${r.nroRengOrigen}`, r.existencia);
    const sin = new Set<string>();
    for (const [k, ex] of existLatest) if (ex === false) sin.add(k);

    const ctrl = new Map<
      string,
      {
        fechaArribo: string | null;
        clienteQuiere: boolean | null;
        vendido: boolean | null;
      }
    >();
    for (const r of ctrlRows)
      ctrl.set(`${r.nroPedOrigen}-${r.nroRengOrigen}`, {
        fechaArribo: r.fechaArribo,
        clienteQuiere: r.clienteQuiere,
        vendido: r.vendido,
      });

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

    const out = rows
      .filter((r) => sin.has(`${r.NroPedOrigen}-${r.NroRengOrigen}`))
      .map((r) => {
        const c = ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`);
        const extra = extraMap.get(r.CodArticulo);
        const extraordinario = !!extra && extra.comprar === null;
        return {
          ...r,
          fechaArribo: c?.fechaArribo ?? null,
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
      .filter((r) => sin.has(`${r.NroPedOrigen}-${r.NroRengOrigen}`))
      .map((r) => {
        const c = ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`);
        return {
          ...r,
          fechaArribo: c?.fechaArribo ?? null,
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

    return NextResponse.json({ fecha, rows: out, listos });
  } catch (error) {
    console.error("GET /api/ventas/faltantes", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
