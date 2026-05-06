// app/rrhh/lib/rrhh/aggregations.ts
// Agregaciones puras sobre ParsedFile. Tolerantes a columnas faltantes:
// si la columna no existe se devuelve [] o 0 según el caso.

import type { ParsedFile } from "@/lib/rrhh/parseXlsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** Busca la primera columna que matchee alguno de los nombres (case-insensitive, sin acentos). */
function findCol(file: ParsedFile, candidates: string[]): string | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  const cands = candidates.map(norm);
  for (const col of file.columns) {
    if (cands.includes(norm(col))) return col;
  }
  // fallback: matching parcial (la columna contiene el candidato)
  for (const col of file.columns) {
    const c = norm(col);
    if (cands.some((cand) => c.includes(cand))) return col;
  }
  return null;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v
      .replace(/[^\d.,-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// function toDate(v: unknown): Date | null {
//   if (!v) return null;
//   if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
//   if (typeof v === "number") {
//     // Excel serial → ms (días desde 1899-12-30)
//     const d = new Date((v - 25569) * 86400 * 1000);
//     return Number.isNaN(d.getTime()) ? null : d;
//   }
//   if (typeof v === "string") {
//     const d = new Date(v);
//     return Number.isNaN(d.getTime()) ? null : d;
//   }
//   return null;
// }

/** Filtra filas dejando solo empleados activos de EVER WEAR S.A. */
function onlyActivos(file: ParsedFile): Row[] {
  const colEstado = findCol(file, ["ESTADO",]);
  const colEmpresa = findCol(file, ["EMPRESA"]);
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  return (file.rows as Row[]).filter((r) => {
    if (colEstado && norm(String(r[colEstado] ?? "")) !== "activo")
      return false;
    if (colEmpresa && !norm(String(r[colEmpresa] ?? "")).includes("ever wear"))
      return false;
    return true;
  });
}

function groupBy<T>(
  rows: Row[],
  key: string,
  valueFn: (r: Row) => T,
  reducer: (acc: T, v: T) => T,
): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = String(r[key] ?? "Sin dato").trim() || "Sin dato";
    const v = valueFn(r);
    m.set(k, m.has(k) ? reducer(m.get(k) as T, v) : v);
  }
  return m;
}

/** Parsea fechas manejando formato argentino DD/MM/YY o DD/MM/YYYY */
function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  
  if (typeof v === "number") {
    // Excel serial → ms (días desde 1899-12-30)
    const d = new Date((v - 25569) * 86400 * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  
  if (typeof v === "string") {
    const raw = v.trim();
    
    // Intentar parsear formato DD/MM/YY o DD/MM/YYYY
    const parts = raw.split("/");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts.map(p => parseInt(p, 10));
      
      // Detectar formato: si p1 > 12 → es día; si p2 > 12 → es mes
      let day: number, month: number, year: number;
      
      if (p1 > 12) {
        // Definitivamente DD/MM/YY
        [day, month, year] = [p1, p2, p3];
      } else if (p2 > 12) {
        // Definitivamente MM/DD/YY → convertir a DD/MM/YY
        [day, month, year] = [p2, p1, p3];
      } else {
        // Ambiguo (ej: 4/7/25) → asumir DD/MM/YY para contexto argentino
        [day, month, year] = [p1, p2, p3];
      }
      
      // Normalizar año de 2 dígitos
      const fullYear = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
      
      const d = new Date(fullYear, month - 1, day);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    
    // Fallback: intentar con Date nativo (para formatos ISO o "Dec 31, 2025")
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getRowsWithLegajo(file: ParsedFile): Row[] {
  const colLegajo = findCol(file, [
    "Nro. de Legajo",
    "LEGAJO",
    "NRO LEGAJO",
    "NÚMERO DE LEGAJO",
    "LEG.",
  ]);
  if (!colLegajo) return file.rows; // Si no existe la columna, no filtramos (fallback seguro)

  return (file.rows as Row[]).filter((r) => {
    const val = r[colLegajo];
    if (val == null) return false; // null o undefined
    const str = String(val).trim();
    if (
      str === "" ||
      str === "0" ||
      str.toUpperCase() === "S/N" ||
      str.toUpperCase() === "N/A"
    ) {
      return false; // Vacío o marcadores de sin dato
    }
    // Si el parser lo leyó como número, debe ser mayor a 0
    if (typeof val === "number") return val > 0;
    return true;
  });
}
// ── Helpers ──────────────────────────────────────────────────────────────────
// ── EMPLEADOS ────────────────────────────────────────────────────────────────

export interface EmpleadosKpis {
  headcount: number;
  edadPromedio: number;
  antiguedadPromedio: number;
  ingresosUltimoMes: number;
}

export function empleadosKpis(file: ParsedFile): EmpleadosKpis {
  const colFechaNac = findCol(file, [
    "FECHA DE NAC.",
    "FECHA NACIMIENTO",
    "NACIMIENTO",
  ]);
  const colFechaIng = findCol(file, ["FECHA DE INGRESO"]);

  const today = new Date();
  const yearMs = 1000 * 60 * 60 * 24 * 365.25;

  // Calculamos la fecha del mes anterior para comparar
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonth = prevMonthDate.getMonth();
  const prevYear = prevMonthDate.getFullYear();

  const activos = onlyActivos(file);

  let edadSum = 0,
    edadCount = 0;
  let antSum = 0,
    antCount = 0;
  let ingresosMes = 0;

  for (const r of activos) {
    if (colFechaNac) {
      const d = toDate(r[colFechaNac]);
      if (d) {
        edadSum += (today.getTime() - d.getTime()) / yearMs;
        edadCount++;
      }
    }
    if (colFechaIng) {
      const d = toDate(r[colFechaIng]);
      if (d) {
        antSum += (today.getTime() - d.getTime()) / yearMs;
        antCount++;

        // ✅ Condición modificada: Compara con el mes y año ANTERIOR
        if (d.getMonth() === prevMonth && d.getFullYear() === prevYear) {
          ingresosMes++;
        }
      }
    }
  }

  return {
    headcount: activos.length,
    edadPromedio: edadCount ? +(edadSum / edadCount).toFixed(1) : 0,
    antiguedadPromedio: antCount ? +(antSum / antCount).toFixed(1) : 0,
    ingresosUltimoMes: ingresosMes,
  };
}

export function headcountPorArea(
  file: ParsedFile,
): Array<{ name: string; value: number }> {
  const col = findCol(file, ["AREA", "ÁREA", "SECTOR", "DEPARTAMENTO"]);
  if (!col) return [];
  const m = groupBy<number>(
    onlyActivos(file),
    col,
    () => 1,
    (a, b) => a + b,
  );
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function distribucionPorSexo(
  file: ParsedFile,
): Array<{ name: string; value: number }> {
  const col = findCol(file, ["SEXO", "GÉNERO", "GENERO"]);
  if (!col) return [];
  const m = groupBy<number>(
    onlyActivos(file),
    col,
    () => 1,
    (a, b) => a + b,
  );
  return [...m.entries()].map(([name, value]) => ({ name, value }));
}

/** Bucket de edades en franjas: <25, 25-34, 35-44, 45-54, 55+ */
export function distribucionEdades(
  file: ParsedFile,
): Array<{ name: string; value: number }> {
  const col = findCol(file, [
    "FECHA DE NAC.",
    "FECHA NACIMIENTO",
    "NACIMIENTO",
  ]);
  if (!col) return [];
  const today = new Date();
  const yearMs = 1000 * 60 * 60 * 24 * 365.25;
  const buckets = { "<25": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0 };
  for (const r of onlyActivos(file)) {
    const d = toDate(r[col]);
    if (!d) continue;
    const edad = (today.getTime() - d.getTime()) / yearMs;
    if (edad < 25) buckets["<25"]++;
    else if (edad < 35) buckets["25-34"]++;
    else if (edad < 45) buckets["35-44"]++;
    else if (edad < 55) buckets["45-54"]++;
    else buckets["55+"]++;
  }
  return Object.entries(buckets).map(([name, value]) => ({ name, value }));
}

/** Ingresos por mes (últimos 12 meses) - TODOS los ingresos, sin filtro de activo */
/** Ingresos por mes (últimos 12 meses) - TODOS los ingresos, filtrado por EVER WEAR */
export function ingresosPorMes(
  file: ParsedFile,
): Array<{ name: string; ingresos: number }> {
  const col = findCol(file, ["FECHA DE INGRESO"]);
  if (!col) return [];
  
  // ✅ Filtro opcional por empresa
  const colEmpresa = findCol(file, ["EMPRESA"]);
  const norm = (s: string) => 
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const map = new Map<string, number>();
  
  // Pre-poblar con ceros para que aparezcan todos los meses
  for (let i = 0; i < 12; i++) {
    const dt = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = `${String(dt.getMonth() + 1).padStart(2, "0")}-${dt.getFullYear()}`;
    map.set(key, 0);
  }
  
  // ✅ Iterar sobre TODAS las filas (histórico de ingresos)
  for (const r of file.rows) {
    // Filtro por empresa (sin filtrar por estado)
    if (colEmpresa && !norm(String(r[colEmpresa] ?? "")).includes("ever wear")) {
      continue;
    }
    
    const d = toDate(r[col]);
    if (!d || d < start) continue;
    
    const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  
  return [...map.entries()].map(([name, ingresos]) => ({ name, ingresos }));
}

// ── EMPLEADOS ────────────────────────────────────────────────────────────────
// ── NÓMINA / SUELDOS ─────────────────────────────────────────────────────────

export interface NominaKpis {
  totalNeto: number;
  totalCostos: number;
  empleadosLiquidados: number;
  netoPromedio: number;
}


export function nominaKpis(file: ParsedFile): NominaKpis {
  const colNeto = findCol(file, ["Neto + Bono", "Neto+Bono"]);
  const colCostos = findCol(file, ["Costos", "Costo"]);
  const colLegajo = findCol(file, [
    "Nro. de Legajo",
    "LEGAJO",
    "NRO LEGAJO",
    "NÚMERO DE LEGAJO",
    "LEG.",
  ]);
  let totalNeto = 0,
    totalCostos = 0;
  const legajosUnicos = new Set<string>();

  
  for (const r of file.rows) {
      // 1. Sumar Neto y Costos de TODAS las filas válidas (incluye desdoblamientos bancarios)
      if (colNeto) {
        const v = toNumber(r[colNeto]);
        if (v > 0) {
          totalNeto += v;
        }
      }
      if (colCostos) {
        totalCostos += toNumber(r[colCostos]);
      }

      // 2. Contar Legajos Únicos (solo si la fila tiene un legajo válido)
      if (colLegajo && r[colLegajo]) {
        const val = r[colLegajo];
        if (val != null) {
          const str = String(val).trim();
          // Validamos que no sea vacío, S/N, 0 o guiones
          if (
            str !== "" &&
            str !== "S/N" &&
            str !== "0" &&
            str !== "—" &&
            str !== "-"
          ) {
            legajosUnicos.add(str);
          }
        }
      }
    }

  const countEmpleadosUnicos = legajosUnicos.size;
  return {
    totalNeto,
    totalCostos,
    netoPromedio: totalNeto / countEmpleadosUnicos ,
  };
}


export function costoPorArea(
  file: ParsedFile,
): Array<{ name: string; costo: number }> {
  const colArea = findCol(file, ["AREA", "ÁREA", "SECTOR"]);
  const colCostos = findCol(file, ["Costos", "Costo Total"]);
  if (!colArea || !colCostos) return [];
  const m = groupBy<number>(
    file.rows,
    colArea,
    (r) => toNumber(r[colCostos]),
    (a, b) => a + b,
  );
  return [...m.entries()]
    .map(([name, costo]) => ({ name, costo: Math.round(costo) }))
    .sort((a, b) => b.costo - a.costo);
}


export function netoPromedioPorArea(
  file: ParsedFile,
): Array<{ name: string; promedio: number }> {
  const colArea = findCol(file, ["AREA"]);
  const colNeto = findCol(file, ["Neto"]);
  if (!colArea || !colNeto) return [];
  const sums = new Map<string, { sum: number; count: number }>();
  for (const r of file.rows) {
    const k = String(r[colArea] ?? "Sin dato").trim() || "Sin dato";
    const cur = sums.get(k) ?? { sum: 0, count: 0 };
    cur.sum += toNumber(r[colNeto]);
    cur.count++;
    sums.set(k, cur);
  }
  return [...sums.entries()]
    .map(([name, { sum, count }]) => ({
      name,
      promedio: count ? Math.round(sum / count) : 0,
    }))
    .sort((a, b) => b.promedio - a.promedio);
}


// ── NÓMINA / SUELDOS ─────────────────────────────────────────────────────────
// ── AUSENTISMO ───────────────────────────────────────────────────────────────

export interface AusentismoKpis {
  totalRegistros: number;
  personasInvolucradas: number;
  diasUnicos: number;
}

export function ausentismoKpis(file: ParsedFile): AusentismoKpis {
  const colName = findCol(file, ["Name", "NOMBRE", "Nombre"]);
  const colDate = findCol(file, ["Date", "FECHA", "Fecha"]);
  const personas = new Set<string>();
  const dias = new Set<string>();
  for (const r of file.rows) {
    if (colName && r[colName]) personas.add(String(r[colName]));
    if (colDate) {
      const d = toDate(r[colDate]);
      if (d) dias.add(d.toISOString().slice(0, 10));
    }
  }
  return {
    totalRegistros: file.rows.length,
    personasInvolucradas: personas.size,
    diasUnicos: dias.size,
  };
}

/** Asistencia agregada por mes (suma de minutos Attended) */
export function asistenciaPorMes(
  file: ParsedFile,
): Array<{ name: string; horas: number }> {
  const colDate = findCol(file, ["Date", "FECHA"]);
  const colAtt = findCol(file, ["Attended", "Asistido"]);
  if (!colDate || !colAtt) return [];
  const m = new Map<string, number>();
  for (const r of file.rows) {
    const d = toDate(r[colDate]);
    if (!d) continue;
    const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    // Attended viene tipo "540 min" o número de minutos
    const raw = r[colAtt];
    let mins = 0;
    if (typeof raw === "number") mins = raw;
    else if (typeof raw === "string")
      mins = parseInt(raw.match(/\d+/)?.[0] ?? "0", 10);
    m.set(key, (m.get(key) ?? 0) + mins);
  }
  return [...m.entries()]
    .map(([name, mins]) => ({ name, horas: +(mins / 60).toFixed(1) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Top 10 personas con más registros (proxy de quién más aparece, útil mientras no calculamos faltas reales) */
export function topAusenciasPorPersona(
  file: ParsedFile,
  limit = 10,
): Array<{ name: string; value: number }> {
  const colName = findCol(file, ["Name", "NOMBRE", "Nombre"]);
  if (!colName) return [];
  const m = groupBy<number>(
    file.rows,
    colName,
    () => 1,
    (a, b) => a + b,
  );
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// ── AUSENTISMO ───────────────────────────────────────────────────────────────
// ── HORAS EXTRA ──────────────────────────────────────────────────────────────

export interface HsExtrasKpis {
  totalHoras: number;
  personasConExtras: number;
  promedioPorPersona: number;
}

export function hsExtrasKpis(file: ParsedFile): HsExtrasKpis {
  const colHs = findCol(file, ["Horas", "Hs", "Total", "Cantidad"]);
  const colName = findCol(file, ["Name", "NOMBRE", "Nombre", "Empleado"]);
  let total = 0;
  const personas = new Set<string>();
  for (const r of file.rows) {
    if (colHs) total += toNumber(r[colHs]);
    if (colName && r[colName]) personas.add(String(r[colName]));
  }
  return {
    totalHoras: +total.toFixed(1),
    personasConExtras: personas.size,
    promedioPorPersona: personas.size ? +(total / personas.size).toFixed(1) : 0,
  };
}

export function hsExtrasPorArea(
  file: ParsedFile,
): Array<{ name: string; horas: number }> {
  const colArea = findCol(file, ["AREA", "ÁREA", "SECTOR"]);
  const colHs = findCol(file, ["Horas", "Hs", "Total", "Cantidad"]);
  if (!colArea || !colHs) return [];
  const m = groupBy<number>(
    file.rows,
    colArea,
    (r) => toNumber(r[colHs]),
    (a, b) => a + b,
  );
  return [...m.entries()]
    .map(([name, horas]) => ({ name, horas: +horas.toFixed(1) }))
    .sort((a, b) => b.horas - a.horas);
}

export function hsExtrasPorMes(
  file: ParsedFile,
): Array<{ name: string; horas: number }> {
  const colDate = findCol(file, ["FECHA", "Date", "Fecha", "Mes"]);
  const colHs = findCol(file, ["Horas", "Hs", "Total", "Cantidad"]);
  if (!colDate || !colHs) return [];
  const m = new Map<string, number>();
  for (const r of file.rows) {
    const d = toDate(r[colDate]);
    if (!d) continue;
    const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    m.set(key, (m.get(key) ?? 0) + toNumber(r[colHs]));
  }
  return [...m.entries()]
    .map(([name, horas]) => ({ name, horas: +horas.toFixed(1) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── HORAS EXTRA ──────────────────────────────────────────────────────────────