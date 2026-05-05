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

// ── Firmas de detección ──────────────────────────────────────────────────────
// Cada firma define:
//  - keys: substrings que deben aparecer (todos) en headers normalizados
//  - sheet: nombre de hoja preferido (opcional)
//  - headerRow: índice 0-based de la fila de headers (opcional, default = autodetect)

interface Signature {
  keys: string[];
  sheet?: string;
  headerRow?: number;
}

const SIGNATURES: Record<
  Exclude<DetectedFileType, "desconocido">,
  Signature
> = {
  empleados: {
    keys: ["legajo", "nombre", "area", "estado", "fecha de ingreso"],
    sheet: "REG. EMPLEADOS",
    headerRow: 1,
  },
  ausentismos: {
    keys: ["nombre", "fecha", "tipo", "motivo"],
  },
  sueldos: {
    keys: ["legajo", "neto", "costos"],
  },
  hs_extras: {
    keys: ["hs extras 50", "hs extras 100", "total hs extras"],
  },
};

// ── Detección ────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isJunkHeader(h: string): boolean {
  if (!h) return true;
  if (/^unnamed:\s*\d+$/i.test(h.trim())) return true;
  if (/^column\d+$/i.test(h.trim())) return true;
  return false;
}

export function detectFileType(headers: string[]): DetectedFileType {
  const normHeaders = headers.map(normalize);
  for (const [type, sig] of Object.entries(SIGNATURES)) {
    const match = sig.keys.every((k) =>
      normHeaders.some((h) => h.includes(normalize(k))),
    );
    if (match) return type as DetectedFileType;
  }
  return "desconocido";
}

// ── Labels ────────────────────────────────────────────────────────────────────

export const FILE_TYPE_LABELS: Record<DetectedFileType, string> = {
  empleados: "Headcount / Empleados",
  ausentismos: "Ausentismo",
  sueldos: "Nómina / Sueldos",
  hs_extras: "Horas Extra",
  desconocido: "Desconocido",
};

// ── Helpers de hoja ───────────────────────────────────────────────────────────

function findSheet(wb: XLSX.WorkBook, target?: string): string {
  if (!target) return wb.SheetNames[0];
  const t = normalize(target);
  return (
    wb.SheetNames.find((n) => normalize(n) === t) ??
    wb.SheetNames.find((n) => normalize(n).includes(t)) ??
    wb.SheetNames[0]
  );
}

function readSheet(
  ws: XLSX.WorkSheet,
  forcedHeaderRow?: number,
): { headers: string[]; dataRows: (string | number | null)[][] } {
  const raw: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  let headerRowIndex: number;
  if (typeof forcedHeaderRow === "number" && raw[forcedHeaderRow]) {
    headerRowIndex = forcedHeaderRow;
  } else {
    headerRowIndex = raw.findIndex(
      (row) => row.filter((c) => c !== null && c !== "").length >= 3,
    );
  }

  if (headerRowIndex === -1) return { headers: [], dataRows: [] };

  const headers = (raw[headerRowIndex] ?? []).map((h) =>
    h !== null && h !== undefined ? String(h).trim() : "",
  );

  const dataRows = raw
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((c) => c !== null && c !== ""));

  return { headers, dataRows };
}

// ── Parser principal ──────────────────────────────────────────────────────────

export async function parseXlsxFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  // Estrategia: probar cada firma con su hoja/headerRow preferidos.
  // Si ninguna firma matchea, fallback a hoja 0 con autodetección.

  type Attempt = {
    type: DetectedFileType;
    headers: string[];
    dataRows: (string | number | null)[][];
  };

  const attempts: Attempt[] = [];

  for (const [type, sig] of Object.entries(SIGNATURES)) {
    const sheetName = findSheet(wb, sig.sheet);
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const { headers, dataRows } = readSheet(ws, sig.headerRow);
    if (headers.length === 0) continue;
    if (detectFileType(headers) === type) {
      attempts.push({ type: type as DetectedFileType, headers, dataRows });
      break;
    }
  }

  let chosen: Attempt;
  if (attempts.length > 0) {
    chosen = attempts[0];
  } else {
    // Fallback: hoja 0, autodetect
    const ws = wb.Sheets[wb.SheetNames[0]];
    const { headers, dataRows } = readSheet(ws);
    chosen = { type: detectFileType(headers), headers, dataRows };
  }

  if (chosen.headers.length === 0) {
    return {
      type: "desconocido",
      fileName: file.name,
      columns: [],
      rows: [],
      rawHeaders: [],
    };
  }

  const { type, headers: rawHeaders, dataRows } = chosen;

  // Deduplicar headers: si hay nombres repetidos, sufijar con _2, _3, etc.
  // Evita que columnas posteriores pisen valores de columnas con el mismo nombre.
  const seen = new Map<string, number>();
  const uniqueHeaders = rawHeaders.map((h) => {
    if (!h) return h;
    const count = seen.get(h) ?? 0;
    seen.set(h, count + 1);
    return count === 0 ? h : `${h}_${count + 1}`;
  });

  const rows: ParsedRow[] = dataRows.map((row) => {
    const obj: ParsedRow = {};
    uniqueHeaders.forEach((header, i) => {
      if (!header) return;
      const val: unknown = row[i];
      if (val instanceof Date) {
        obj[header] = val.toLocaleDateString("es-AR");
      } else {
        obj[header] = val as string | number | null;
      }
    });
    return obj;
  });

  // Mostrar todas las columnas reales (sin Unnamed / vacías)
  const columns = uniqueHeaders.filter((h) => h && !isJunkHeader(h));

  return {
    type,
    fileName: file.name,
    columns,
    rows,
    rawHeaders: uniqueHeaders,
  };
}

// ── KPIs (sin cambios) ────────────────────────────────────────────────────────

export function calcKpisEmpleados(rows: ParsedRow[]) {
  const activos = rows.filter(
    (r) => normalize(String(r["ESTADO"] ?? r["Estado"] ?? "")) === "activo",
  ).length;
  const areas = [
    ...new Set(rows.map((r) => r["AREA"] ?? r["Area"]).filter(Boolean)),
  ];
  const porArea: Record<string, number> = {};
  areas.forEach((a) => {
    porArea[String(a)] = rows.filter(
      (r) => (r["AREA"] ?? r["Area"]) === a,
    ).length;
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
      const v = parseFloat(
        String(r[field] ?? "0")
          .replace(/[$.]/g, "")
          .replace(",", "."),
      );
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
