// Exporta el histórico mensual de /deposito/faltantes (marcas "en existencia"
// / "sin existencia") a .xlsx. Usa `xlsx` (SheetJS), mismo patrón que
// lib/ventas/exportFaltantes.ts y lib/compras/exportFaltantes.ts.
import * as XLSX from "xlsx";

export interface FilaHistorico {
  fecha: string;
  nroPedOrigen: number;
  nroRengOrigen: number;
  codArticulo: string;
  nombre: string;
  ubicacion: string;
  cliente: string;
  vendedor: string;
  cantidad: number | null;
  cantPedida: number | null;
  importe: number;
  existencia: boolean | null;
  malFacturado: boolean | null;
}

function ajustarAnchos(ws: XLSX.WorkSheet, filas: Record<string, unknown>[]): void {
  if (filas.length === 0) return;
  const cols = Object.keys(filas[0]);
  ws["!cols"] = cols.map((c) => {
    let max = c.length;
    for (const f of filas) {
      const len = String(f[c] ?? "").length;
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 2, 8), 50) };
  });
}

function fmtAr(iso: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "";
}

function fila(r: FilaHistorico) {
  return {
    Fecha: fmtAr(r.fecha),
    Pedido: r.nroPedOrigen,
    "Código": r.codArticulo,
    "Artículo": r.nombre,
    Ubicación: r.ubicacion,
    Cliente: r.cliente,
    Vendedor: r.vendedor,
    "Cant. marcada": r.cantidad ?? "",
    "Cant. pedida": r.cantPedida ?? "",
    Importe: r.importe,
  };
}

// rows: ya filtradas por mes (vienen así de GET /api/deposito/faltantes/historico).
export function exportarFaltantesExistencia(
  rows: FilaHistorico[],
  mes: string,
): void {
  const wb = XLSX.utils.book_new();

  const con = rows.filter((r) => r.existencia === true).map(fila);
  const wsCon = XLSX.utils.json_to_sheet(con);
  ajustarAnchos(wsCon, con);
  XLSX.utils.book_append_sheet(wb, wsCon, "Con existencia");

  const sin = rows.filter((r) => r.existencia === false).map(fila);
  const wsSin = XLSX.utils.json_to_sheet(sin);
  ajustarAnchos(wsSin, sin);
  XLSX.utils.book_append_sheet(wb, wsSin, "Sin existencia");

  const mal = rows.filter((r) => r.malFacturado === true).map(fila);
  const wsMal = XLSX.utils.json_to_sheet(mal);
  ajustarAnchos(wsMal, mal);
  XLSX.utils.book_append_sheet(wb, wsMal, "Mal facturado");

  XLSX.writeFile(wb, `faltantes-existencia-${mes}.xlsx`);
}
