import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const API_URL = process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────────────────────
// /compras/pases — GET ?mes=YYYY-MM
//   Registro de los faltantes que PASARON A COMPRAS en el mes (se registra al
//   cargar la fecha de arribo en /compras/faltantes → preparado.
//   faltante_pase_compras, ver sql/compras_faltante_pase.sql) cruzado contra lo
//   efectivamente COMPRADO ese mismo mes (OC hechas por FecMovim de cabecera,
//   indicadores-api /compras/compras-valorizado, que ya devuelve unidades por
//   artículo). Es la comparación de fin de mes: pasado a compras vs comprado.
//
//   Rendimiento: 1 range scan sobre el índice de "pasadoEl" (mes cerrado) + 1
//   sola llamada a indicadores-api para TODO el mes; el cruce artículo↔comprado
//   se hace en memoria con un Map. Nada por fila.
// ──────────────────────────────────────────────────────────────────────────────

interface PaseRow {
  fecha: string;
  codArticulo: string;
  nombre: string | null;
  proveedor: string | null;
  linea: string | null;
  faltan: number;
  descubierto: number;
  ocTotal: number;
  stock: number;
  importe: number;
  importacion: boolean;
  fechaArribo: string | null;
  usuario: string | null;
  pasadoEl: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const mes = req.nextUrl.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: "mes inválido (YYYY-MM)" }, { status: 400 });
  }
  const [y, m] = mes.split("-").map(Number);
  const desde = iso(new Date(Date.UTC(y, m - 1, 1)));
  const hasta = iso(new Date(Date.UTC(y, m, 0))); // último día del mes
  const finExcl = iso(new Date(Date.UTC(y, m, 1))); // primer día del mes siguiente

  let rows: PaseRow[] = [];
  let tablaWarn = false;
  try {
    const raw = await prisma.$queryRaw<
      {
        fecha: Date;
        codArticulo: string;
        nombre: string | null;
        proveedor: string | null;
        linea: string | null;
        faltan: number;
        descubierto: number;
        ocTotal: number;
        stock: number;
        importe: number;
        importacion: boolean;
        fechaArribo: Date | null;
        usuario: string | null;
        pasadoEl: Date;
      }[]
    >`
      SELECT fecha, "codArticulo", nombre, proveedor, linea, faltan, descubierto,
             "ocTotal", stock, importe, importacion, "fechaArribo", usuario, "pasadoEl"
      FROM preparado.faltante_pase_compras
      WHERE "pasadoEl" >= ${desde}::date AND "pasadoEl" < ${finExcl}::date
      ORDER BY "pasadoEl" DESC
    `;
    rows = raw.map((r) => ({
      fecha: iso(r.fecha),
      codArticulo: r.codArticulo,
      nombre: r.nombre,
      proveedor: r.proveedor,
      linea: r.linea,
      faltan: Number(r.faltan) || 0,
      descubierto: Number(r.descubierto) || 0,
      ocTotal: Number(r.ocTotal) || 0,
      stock: Number(r.stock) || 0,
      importe: Number(r.importe) || 0,
      importacion: !!r.importacion,
      fechaArribo: r.fechaArribo ? iso(r.fechaArribo) : null,
      usuario: r.usuario,
      pasadoEl: r.pasadoEl.toISOString(),
    }));
  } catch {
    // Tabla no aplicada todavía (sql/compras_faltante_pase.sql).
    tablaWarn = true;
  }

  // Comprado del mes por artículo (una sola llamada, se cruza en memoria).
  const comprado = new Map<string, number>();
  let compradoWarn = false;
  if (rows.length) {
    try {
      const res = await fetch(
        `${API_URL}/compras/compras-valorizado?desde=${desde}&hasta=${hasta}`,
        { cache: "no-store", signal: AbortSignal.timeout(45000) },
      );
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      for (const r of json.rows ?? []) {
        comprado.set(String(r.CodArticulo), Number(r.Cantidad) || 0);
      }
    } catch {
      compradoWarn = true;
    }
  }

  const out = rows.map((r) => {
    const uds = comprado.get(r.codArticulo) ?? 0;
    return { ...r, compradoUnidades: uds, comprado: uds > 0 };
  });

  // OJO: un mismo artículo puede tener varios pases (días distintos). Las
  // unidades compradas se suman UNA sola vez por artículo, no por fila.
  const artsUnicos = new Set(out.map((r) => r.codArticulo));
  const totales = {
    pases: out.length,
    articulos: artsUnicos.size,
    faltan: out.reduce((a, r) => a + r.faltan, 0),
    descubierto: out.reduce((a, r) => a + r.descubierto, 0),
    importe: out.reduce((a, r) => a + r.importe, 0),
    conCompra: new Set(out.filter((r) => r.comprado).map((r) => r.codArticulo)).size,
    compradoUnidades: [...artsUnicos].reduce((a, c) => a + (comprado.get(c) ?? 0), 0),
  };

  return NextResponse.json({ mes, desde, hasta, rows: out, totales, tablaWarn, compradoWarn });
}
