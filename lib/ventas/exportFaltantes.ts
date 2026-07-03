// Exporta /ventas/faltantes a .xlsx (descarga en el navegador). Usa `xlsx`
// (SheetJS), mismo patrón que lib/buscador/export.ts.
import * as XLSX from "xlsx";

interface ItemBase {
  NroPedOrigen: number;
  CodArticulo: string;
  Nombre: string;
  CantPend: number;
  Cliente: number | string | null;
  ClienteNombre: string | null;
  Importe: number;
  Fecha: string | null;
  fechaArribo: string | null;
}
interface Item extends ItemBase {
  extraordinario: boolean;
}
interface ItemListo extends ItemBase {
  clienteQuiere: boolean | null;
  vendido: boolean | null;
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

function filaItem(it: Item) {
  return {
    Cliente: it.ClienteNombre || it.Cliente || "",
    Pedido: it.NroPedOrigen,
    "Código": it.CodArticulo,
    "Artículo": it.Nombre,
    "Cant. faltante": it.CantPend,
    "Fecha faltante": it.Fecha || "",
    "Fecha arribo": it.fechaArribo || "",
    Importe: it.Importe,
    Extraordinario: it.extraordinario ? "Sí" : "No",
  };
}

function filaListo(it: ItemListo) {
  return {
    Cliente: it.ClienteNombre || it.Cliente || "",
    Pedido: it.NroPedOrigen,
    "Código": it.CodArticulo,
    "Artículo": it.Nombre,
    "Cant. faltante": it.CantPend,
    "Fecha faltante": it.Fecha || "",
    "Fecha arribo": it.fechaArribo || "",
    Importe: it.Importe,
    "Cliente quiere": it.clienteQuiere == null ? "" : it.clienteQuiere ? "Sí" : "No",
    Vendido: it.vendido == null ? "" : it.vendido ? "Sí" : "No",
  };
}

// items/listos: pasar ya filtrados como estén en pantalla (p.ej. con el
// toggle "Extraordinario" aplicado).
export function exportarFaltantesVentas(items: Item[], listos: ItemListo[]): void {
  const wb = XLSX.utils.book_new();

  const filasItems = items.map(filaItem);
  const wsItems = XLSX.utils.json_to_sheet(filasItems);
  ajustarAnchos(wsItems, filasItems);
  XLSX.utils.book_append_sheet(wb, wsItems, "Faltantes");

  const filasListos = listos.map(filaListo);
  const wsListos = XLSX.utils.json_to_sheet(filasListos);
  ajustarAnchos(wsListos, filasListos);
  XLSX.utils.book_append_sheet(wb, wsListos, "Listos para vender");

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `faltantes-ventas-${fecha}.xlsx`);
}
