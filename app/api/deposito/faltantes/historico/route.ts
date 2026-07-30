import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Histórico mensual de /deposito/faltantes: para reportes (ej. "dame en Excel
// los artículos marcados con/sin existencia de tal mes"), a diferencia de
// GET /api/deposito/faltantes/check que solo trae marcas de UN día.
//
// preparado.faltante_existencia no guarda nombre/ubicación/cliente (solo
// fecha, pedido, renglón, cod. artículo, existencia, cantidad) — se resuelve
// con la ÚLTIMA fila vista en preparado.faltante_wms para ese
// (nroPedOrigen, codArticulo), mismo patrón/mismo join que ya usa
// GET /api/ventas/faltantes (ver comentario ahí: "Bug real encontrado
// 2026-07-10" — el cruce es por nroPedOrigen+codArticulo, NO por
// nroRengOrigen, porque WMS y Magnus numeran el renglón distinto).
// Best-effort: si faltante_wms no tiene esa fila (p.ej. quedó fuera de la
// ventana que se persiste), el renglón sale igual pero con nombre/ubicación
// vacíos — el código de artículo siempre está.

interface ExistRow {
  fecha: Date;
  nroPedOrigen: number;
  nroRengOrigen: number;
  codArticulo: string | null;
  existencia: boolean | null;
  malFacturado: boolean | null;
  cantidad: number | null;
}

interface WmsRow {
  nroPedOrigen: number | null;
  nroRengOrigen: number;
  codArticulo: string;
  nombre: string | null;
  cliente: string | null;
  ubicacion: string | null;
  vendedor: string | null;
  cantPedida: unknown;
  importe: unknown;
}

export async function GET(req: NextRequest) {
  const mes = req.nextUrl.searchParams.get("mes"); // "YYYY-MM"
  const m = /^(\d{4})-(\d{2})$/.exec(mes ?? "");
  if (!m) {
    return NextResponse.json(
      { error: "mes requerido, formato YYYY-MM" },
      { status: 400 },
    );
  }
  const anio = Number(m[1]);
  const mesNum = Number(m[2]); // 1-12
  const desde = new Date(Date.UTC(anio, mesNum - 1, 1));
  const hasta = new Date(Date.UTC(anio, mesNum, 1)); // exclusivo (1er día del mes siguiente)

  try {
    const [existRows, wmsRows] = await Promise.all([
      prisma.faltante_existencia.findMany({
        where: {
          fecha: { gte: desde, lt: hasta },
          OR: [{ existencia: { not: null } }, { malFacturado: true }],
        },
        orderBy: [{ fecha: "asc" }, { nroPedOrigen: "asc" }],
        select: {
          fecha: true,
          nroPedOrigen: true,
          nroRengOrigen: true,
          codArticulo: true,
          existencia: true,
          malFacturado: true,
          cantidad: true,
        },
      }),
      prisma.$queryRaw<WmsRow[]>`
        SELECT DISTINCT ON ("nroPedOrigen", "codArticulo")
               "nroPedOrigen", "nroRengOrigen", "codArticulo", nombre,
               cliente, ubicacion, vendedor, "cantPedida", importe
        FROM preparado.faltante_wms
        ORDER BY "nroPedOrigen", "codArticulo", "updatedAt" DESC
      `.catch(() => [] as WmsRow[]),
    ]);

    const wmsByKey = new Map<
      string,
      {
        nombre: string;
        cliente: string;
        ubicacion: string;
        vendedor: string;
        cantPedida: number;
        importe: number;
      }
    >();
    for (const r of wmsRows) {
      if (r.nroPedOrigen === null) continue;
      const cod = (r.codArticulo ?? "").trim();
      if (!cod) continue;
      wmsByKey.set(`${r.nroPedOrigen}-${cod}`, {
        nombre: r.nombre ?? "",
        cliente: r.cliente ?? "",
        ubicacion: r.ubicacion ?? "",
        vendedor: r.vendedor ?? "",
        cantPedida: Number(r.cantPedida ?? 0),
        importe: Number(r.importe ?? 0),
      });
    }

    const rows = existRows.map((r: ExistRow) => {
      const cod = (r.codArticulo ?? "").trim();
      const w = wmsByKey.get(`${r.nroPedOrigen}-${cod}`);
      return {
        fecha: r.fecha.toISOString().slice(0, 10),
        nroPedOrigen: r.nroPedOrigen,
        nroRengOrigen: r.nroRengOrigen,
        codArticulo: cod,
        nombre: w?.nombre ?? "",
        ubicacion: w?.ubicacion ?? "",
        cliente: w?.cliente ?? "",
        vendedor: w?.vendedor ?? "",
        cantidad: r.cantidad,
        cantPedida: w?.cantPedida ?? null,
        importe: w?.importe ?? 0,
        existencia: r.existencia,
        malFacturado: r.malFacturado,
      };
    });

    return NextResponse.json({
      mes,
      desde: desde.toISOString().slice(0, 10),
      hasta: new Date(hasta.getTime() - 86400000).toISOString().slice(0, 10),
      total: rows.length,
      rows,
    });
  } catch (error) {
    console.error("GET /api/deposito/faltantes/historico", error);
    return NextResponse.json(
      { error: "Error al leer histórico" },
      { status: 500 },
    );
  }
}
