import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API_URL = process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/faltantes — agrega server-side todo lo que necesita la
//   "Tabla 1" de /ventas/faltantes. NO escribe nada acá; solo LEE:
//     · indicadores-api /deposito/faltantes      (renglones + fecha del día)
//     · preparado.faltante_existencia             (¿sin existencia?)
//     · preparado.faltante_control                (fechaArribo, clienteQuiere)
//     · preparado.faltante_extraordinario          (flag de COMPRAS, por
//       código de artículo — no se toca esa tabla, solo se consulta)
//
//   Regla de entrada (según diagrama): sin existencia + clienteQuiere aún sin
//   responder + (ya tiene fecha de arribo O compras lo marcó extraordinario).
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

    const [existRows, ctrlRows, extraRows] = await Promise.all([
      prisma.$queryRaw<
        { nroPedOrigen: number; nroRengOrigen: number; existencia: boolean | null }[]
      >`
        SELECT "nroPedOrigen", "nroRengOrigen", existencia
        FROM preparado.faltante_existencia
        WHERE fecha = ${fecha}::date
      `,
      prisma.$queryRaw<
        {
          nroPedOrigen: number;
          nroRengOrigen: number;
          fechaArribo: string | null;
          clienteQuiere: boolean | null;
        }[]
      >`
        SELECT "nroPedOrigen", "nroRengOrigen",
               to_char("fechaArribo", 'YYYY-MM-DD') AS "fechaArribo",
               "clienteQuiere"
        FROM preparado.faltante_control
        WHERE fecha = ${fecha}::date
      `,
      prisma.$queryRaw<{ codArticulo: string; extraordinario: boolean }[]>`
        SELECT DISTINCT ON ("codArticulo") "codArticulo", extraordinario
        FROM preparado.faltante_extraordinario
        ORDER BY "codArticulo", "updatedAt" DESC
      `,
    ]);

    const sin = new Set<string>();
    for (const r of existRows)
      if (r.existencia === false) sin.add(`${r.nroPedOrigen}-${r.nroRengOrigen}`);

    const ctrl = new Map<
      string,
      { fechaArribo: string | null; clienteQuiere: boolean | null }
    >();
    for (const r of ctrlRows)
      ctrl.set(`${r.nroPedOrigen}-${r.nroRengOrigen}`, {
        fechaArribo: r.fechaArribo,
        clienteQuiere: r.clienteQuiere,
      });

    const extraSet = new Set<string>();
    for (const r of extraRows) if (r.extraordinario) extraSet.add(r.codArticulo);

    const out = rows
      .filter((r) => sin.has(`${r.NroPedOrigen}-${r.NroRengOrigen}`))
      .map((r) => {
        const c = ctrl.get(`${r.NroPedOrigen}-${r.NroRengOrigen}`);
        const extraordinario = extraSet.has(r.CodArticulo);
        return {
          ...r,
          fechaArribo: c?.fechaArribo ?? null,
          clienteQuiere: c?.clienteQuiere ?? null,
          extraordinario,
        };
      })
      .filter((r) => r.clienteQuiere === null && (r.fechaArribo !== null || r.extraordinario));

    return NextResponse.json({ fecha, rows: out });
  } catch (error) {
    console.error("GET /api/ventas/faltantes", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
