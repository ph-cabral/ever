import type { ParsedFile, DetectedFileType, ParsedRow } from "./Parsexlsx";

/**
 * Enriquece filas de sueldos con datos de empleados (Area, Puesto, Sucursal)
 * Join por Legajo.
 */
export function joinSueldosConEmpleados(
  sueldos: ParsedFile | undefined,
  empleados: ParsedFile | undefined
): ParsedRow[] {
  if (!sueldos?.rows?.length) return [];
  if (!empleados?.rows?.length) return sueldos.rows;

  // Index por Legajo (string para evitar problemas de tipos)
  const empleadosMap = new Map<string, ParsedRow>();
  empleados.rows.forEach((emp) => {
    const legajo = String(emp["Legajo"] ?? "").trim();
    if (legajo) empleadosMap.set(legajo, emp);
  });

  return sueldos.rows.map((row) => {
    const legajo = String(row["Legajo"] ?? "").trim();
    const emp = empleadosMap.get(legajo);
    if (!emp) return row;

    return {
      ...row,
      Area: emp["Area"] ?? row["Area"],
      Puesto: emp["Puesto"] ?? row["Puesto"],
      Sucursal: emp["Sucursal"] ?? row["Sucursal"],
      Tipo_Contrato: emp["Tipo_Contrato"] ?? row["Tipo_Contrato"],
    };
  });
}

/**
 * Agrupa un array de filas por un campo y aplica un reducer numérico.
 */
export function groupBySum(
  rows: ParsedRow[],
  groupField: string,
  sumField: string
): { name: string; value: number }[] {
  const acc: Record<string, number> = {};

  rows.forEach((r) => {
    const key = String(r[groupField] ?? "Sin dato").trim() || "Sin dato";
    const raw = String(r[sumField] ?? "0")
      .replace(/[$\s.]/g, "")
      .replace(",", ".");
    const val = parseFloat(raw);
    if (!isNaN(val)) acc[key] = (acc[key] ?? 0) + val;
  });

  return Object.entries(acc)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Agrupa por campo y cuenta ocurrencias.
 */
export function groupByCount(
  rows: ParsedRow[],
  groupField: string
): { name: string; value: number }[] {
  const acc: Record<string, number> = {};
  rows.forEach((r) => {
    const key = String(r[groupField] ?? "Sin dato").trim() || "Sin dato";
    acc[key] = (acc[key] ?? 0) + 1;
  });
  return Object.entries(acc)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Empleados activos / no activos (para rotación derivada).
 */
export function splitByEstado(empleados: ParsedFile | undefined) {
  if (!empleados?.rows?.length) return { activos: [], egresados: [] };

  const activos: ParsedRow[] = [];
  const egresados: ParsedRow[] = [];

  empleados.rows.forEach((r) => {
    const estado = String(r["Estado"] ?? "").toLowerCase().trim();
    if (estado === "activo") activos.push(r);
    else egresados.push(r);
  });

  return { activos, egresados };
}

