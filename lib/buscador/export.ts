// Exporta los prospectos a un .xlsx (descarga en el navegador).
// Una hoja "Todos" + una hoja por provincia. Usa la lib `xlsx` (SheetJS).
import * as XLSX from "xlsx";
import type { Prospecto } from "./types";
import { COLUMNAS } from "./types";

function fila(p: Prospecto): Record<string, string | number> {
  const o: Record<string, string | number> = {};
  for (const c of COLUMNAS) {
    const v = p[c.key];
    o[c.label] = v == null ? "" : typeof v === "number" ? v : String(v);
  }
  return o;
}

function ajustarAnchos(ws: XLSX.WorkSheet, filas: Prospecto[]): void {
  ws["!cols"] = COLUMNAS.map((c) => {
    let max = c.label.length;
    for (const p of filas) {
      const v = p[c.key];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 2, 8), 50) };
  });
}

function nombreHoja(s: string): string {
  // Excel: máx 31 chars y sin : \ / ? * [ ]
  return s.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Hoja";
}

export function exportarExcel(prospectos: Prospecto[], q: string): void {
  const wb = XLSX.utils.book_new();

  const wsAll = XLSX.utils.json_to_sheet(prospectos.map(fila));
  ajustarAnchos(wsAll, prospectos);
  XLSX.utils.book_append_sheet(wb, wsAll, "Todos");

  const porProv = new Map<string, Prospecto[]>();
  for (const p of prospectos) {
    const k = p.provincia ?? "Sin provincia";
    const arr = porProv.get(k);
    if (arr) arr.push(p);
    else porProv.set(k, [p]);
  }
  for (const [prov, lista] of [...porProv.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const ws = XLSX.utils.json_to_sheet(lista.map(fila));
    ajustarAnchos(ws, lista);
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja(prov));
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const slug =
    q
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "busqueda";
  XLSX.writeFile(wb, `prospectos-${slug}-${fecha}.xlsx`);
}
