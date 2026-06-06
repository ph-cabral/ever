import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseDeposito } from "@/lib/deposito/parseDeposito";
import { parseTiempo } from "@/lib/deposito/parseTiempo";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Columnas que delatan el export de "Tiempo de Pedidos"
const TIEMPO_HINTS = ["FechaRegistracionPedido", "NroMovVenta", "Tiempo_E_Confirm_Cierre"];

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  try {
    const buf = Buffer.from(await file.arrayBuffer());

    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true }) as Record<string, unknown>[];
      const keys = rows.length ? Object.keys(rows[0]) : [];
      if (TIEMPO_HINTS.some((h) => keys.includes(h))) {
        return NextResponse.json({ kind: "tiempo", data: parseTiempo(rows, file.name) });
      }
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
      return NextResponse.json({ kind: "produccion", data: parseDeposito(csv, file.name) });
    }

    const csv = new TextDecoder("utf-8").decode(buf);
    const head = csv.split(/\r?\n/)[0] ?? "";
    if (TIEMPO_HINTS.some((h) => head.includes(h))) {
      return NextResponse.json({ kind: "tiempo", data: parseTiempo(csvToRows(csv), file.name) });
    }
    return NextResponse.json({ kind: "produccion", data: parseDeposito(csv, file.name) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al parsear" }, { status: 500 });
  }
}

function csvToRows(csv: string): Record<string, unknown>[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const split = (l: string) => l.split(sep).map((c) => c.replace(/^"([\s\S]*)"$/, "$1").trim());
  const header = split(lines[0]);
  return lines.slice(1).map((l) => {
    const c = split(l);
    const o: Record<string, unknown> = {};
    header.forEach((h, i) => (o[h] = c[i]));
    return o;
  });
}

