// Exporta la tabla "Errores de Mesa" (/deposito) a .xlsx (descarga en el
// navegador). Mismo patrón que lib/compras/exportFaltantes.ts (SheetJS).
// Recibe las filas ya filtradas como están en pantalla (rango desde/hasta +
// selects de Registrada/Operario) — no vuelve a pedir nada al server.
import * as XLSX from "xlsx";
import {
  ErrorMesaRow,
  getRegistrador,
  getOperario,
} from "@/app/deposito/components/erroresMesa";
import { fmtDate } from "@/app/deposito/components/ui";

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

function fila(r: ErrorMesaRow) {
  return {
    Fecha: fmtDate(r.fecha),
    "Nro Pedido": r.nroPedido,
    "Tipo Pedido": r.tipoPedido ?? "",
    OT: r.ot ?? "",
    Registrada: getRegistrador(r) ?? "",
    Controlador: r.nombreControladorReal ?? "",
    Operario: getOperario(r) ?? "",
    "Detalle Error": r.detalleError,
    Observación: r.observacion ?? "",
  };
}

export function exportarErroresMesa(
  rows: ErrorMesaRow[],
  opts: { desde?: string | null; hasta?: string | null } = {},
): void {
  const wb = XLSX.utils.book_new();
  const filas = rows.map(fila);
  const ws = XLSX.utils.json_to_sheet(filas);
  ajustarAnchos(ws, filas);
  XLSX.utils.book_append_sheet(wb, ws, "Errores de Mesa");

  const fecha = new Date().toISOString().slice(0, 10);
  const rango = opts.desde && opts.hasta ? `${opts.desde}_a_${opts.hasta}-` : "";
  XLSX.writeFile(wb, `errores-mesa-${rango}${fecha}.xlsx`);
}
