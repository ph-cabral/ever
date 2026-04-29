import * as XLSX from "xlsx";

// ── Tipos de datos ────────────────────────────────────────────────────────────

export type DetectedFileType =
  | "empleados"
  | "ausentismos"
  | "sueldos"
  | "hs_extras"
  | "desconocido";

export interface ParsedRow {
  [key: string]: string | number | null;
}

export interface ParsedFile {
  type: DetectedFileType;
  fileName: string;
  columns: string[];
  rows: ParsedRow[];
  rawHeaders: string[];
}

// ── Columnas clave por tipo de archivo ───────────────────────────────────────
// La detección busca que TODAS las columnas clave estén presentes (case-insensitive)

const SIGNATURES: Record<DetectedFileType, string[]> = {
  empleados: ["legajo", "nombre_completo", "area", "estado", "fecha_ingreso"],
  ausentismos: ["nombre_completo", "fecha", "tipo", "motivo"],
  sueldos: ["legajo", "neto", "bruto", "costos"],
  hs_extras: ["hs extras 50%", "hs extras 100%", "total hs extras"],
  desconocido: [],
};

// ── Detección de tipo ─────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function detectFileType(headers: string[]): DetectedFileType {
  const normHeaders = headers.map(normalize);

  for (const [type, keys] of Object.entries(SIGNATURES)) {
    if (type === "desconocido") continue;
    const match = keys.every((k) => normHeaders.some((h) => h.includes(normalize(k))));
    if (match) return type as DetectedFileType;
  }

  return "desconocido";
}

// ── Labels amigables por tipo ─────────────────────────────────────────────────

export const FILE_TYPE_LABELS: Record<DetectedFileType, string> = {
  empleados: "Headcount / Empleados",
  ausentismos: "Ausentismo",
  sueldos: "Nómina / Sueldos",
  hs_extras: "Horas Extra",
  desconocido: "Desconocido",
};

// ── Columnas visibles (display) por tipo ──────────────────────────────────────

export const DISPLAY_COLUMNS: Record<DetectedFileType, string[]> = {
  empleados: [
    "Legajo",
    "Nombre_Completo",
    "Area",
    "Puesto",
    "Fecha_Ingreso",
    "Tipo_Contrato",
    "Estado",
  ],
  ausentismos: [
    "Nombre_Completo",
    "Fecha",
    "Mes",
    "Tipo",
    "Motivo",
    "Supervisor",
  ],
  sueldos: [
    "Legajo",
    "Nombre_Completo",
    "Neto",
    "Bruto",
    "Retenciones",
    "Costos",
    "Banco",
  ],
  hs_extras: [
    "Periodo",
    "Legajo",
    "Nombre Completo",
    "Area",
    "Hs Normales del mes",
    "Hs Extras 50%",
    "Hs Extras 100%",
    "Total Hs Extras",
  ],
  desconocido: [],
};

// ── Parser principal ──────────────────────────────────────────────────────────

export async function parseXlsxFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  // Filtrar filas completamente vacías y encontrar la primera fila con headers
  const headerRowIndex = raw.findIndex(
    (row) => row.filter((c) => c !== null && c !== "").length >= 3
  );

  if (headerRowIndex === -1) {
    return {
      type: "desconocido",
      fileName: file.name,
      columns: [],
      rows: [],
      rawHeaders: [],
    };
  }

  const rawHeaders = raw[headerRowIndex].map((h) =>
    h !== null ? String(h).trim() : ""
  );

  const dataRows = raw.slice(headerRowIndex + 1).filter(
    (row) => row.some((c) => c !== null && c !== "")
  );

  const type = detectFileType(rawHeaders);

  const rows: ParsedRow[] = dataRows.map((row) => {
    const obj: ParsedRow = {};
    rawHeaders.forEach((header, i) => {
      if (!header) return;
      const val = row[i];
      // Formatear fechas
      if (val instanceof Date) {
        obj[header] = val.toLocaleDateString("es-AR");
      } else {
        obj[header] = val;
      }
    });
    return obj;
  });

  // Usar columnas de display si el tipo fue detectado, sino usar todas las del archivo
  const displayCols = DISPLAY_COLUMNS[type];
  const columns =
    displayCols.length > 0
      ? rawHeaders.filter((h) =>
          displayCols.some((d) => normalize(d) === normalize(h))
        )
      : rawHeaders.filter(Boolean);

  return {
    type,
    fileName: file.name,
    columns: columns.length > 0 ? columns : rawHeaders.filter(Boolean),
    rows,
    rawHeaders,
  };
}

// ── Helpers para KPIs ─────────────────────────────────────────────────────────

export function calcKpisEmpleados(rows: ParsedRow[]) {
  const activos = rows.filter(
    (r) => normalize(String(r["Estado"] ?? "")) === "activo"
  ).length;
  const areas = [...new Set(rows.map((r) => r["Area"]).filter(Boolean))];
  const porArea: Record<string, number> = {};
  areas.forEach((a) => {
    porArea[String(a)] = rows.filter((r) => r["Area"] === a).length;
  });
  return { total: rows.length, activos, porArea };
}

export function calcKpisAusentismos(rows: ParsedRow[]) {
  const porTipo: Record<string, number> = {};
  rows.forEach((r) => {
    const tipo = String(r["Tipo"] ?? "Sin tipo");
    porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
  });
  const porMes: Record<string, number> = {};
  rows.forEach((r) => {
    const mes = String(r["Mes"] ?? "Sin mes");
    porMes[mes] = (porMes[mes] ?? 0) + 1;
  });
  return { total: rows.length, porTipo, porMes };
}

export function calcKpisSueldos(rows: ParsedRow[]) {
  const sumField = (field: string) =>
    rows.reduce((acc, r) => {
      const v = parseFloat(String(r[field] ?? "0").replace(/[$.]/g, "").replace(",", "."));
      return acc + (isNaN(v) ? 0 : v);
    }, 0);

  return {
    totalNeto: sumField("Neto"),
    totalBruto: sumField("Bruto"),
    totalCostos: sumField("Costos"),
    cantEmpleados: rows.length,
  };
}

export function calcKpisHsExtras(rows: ParsedRow[]) {
  const sumField = (field: string) =>
    rows.reduce((acc, r) => {
      const v = parseFloat(String(r[field] ?? "0"));
      return acc + (isNaN(v) ? 0 : v);
    }, 0);

  return {
    totalExtras: sumField("Total Hs Extras"),
    extras50: sumField("Hs Extras 50%"),
    extras100: sumField("Hs Extras 100%"),
  };
}
