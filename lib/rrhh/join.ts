// lib/rrhh/join.ts
import type { ParsedFile, ParsedRow } from "./parseXlsx";

/** "$ 1.234,56" → 1234.56 */
export function parseMoney(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[$\s.]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Enriquece sueldos con datos de empleados (join por Legajo). */
export function joinSueldosConEmpleados(
  sueldos: ParsedFile | undefined,
  empleados: ParsedFile | undefined
): ParsedRow[] {
  if (!sueldos?.rows?.length) return [];
  if (!empleados?.rows?.length) return sueldos.rows;

  const empMap = new Map<string, ParsedRow>();
  empleados.rows.forEach((emp) => {
    const leg = norm(emp["Legajo"]);
    if (leg) empMap.set(leg, emp);
  });

  return sueldos.rows.map((row) => {
    const emp = empMap.get(norm(row["Legajo"]));
    if (!emp) return row;
    return {
      ...row,
      Area: emp["Area"] ?? row["Area"],
      Puesto: emp["Puesto"] ?? row["Puesto"],
      Sucursal: emp["Sucursal"] ?? row["Sucursal"],
      Tipo_Contrato: emp["Tipo_Contrato"] ?? row["Tipo_Contrato"],
      Estado: emp["Estado"] ?? row["Estado"],
      Fecha_Ingreso: emp["Fecha_Ingreso"] ?? row["Fecha_Ingreso"],
    };
  });
}

/** Agrupa por campo y suma otro. Output ordenado desc, listo para Recharts. */
export function groupBySum(
  rows: ParsedRow[],
  groupField: string,
  sumField: string,
  parser: (v: unknown) => number = parseMoney
): { name: string; value: number }[] {
  const acc: Record<string, number> = {};
  rows.forEach((r) => {
    const key = String(r[groupField] ?? "Sin dato").trim() || "Sin dato";
    acc[key] = (acc[key] ?? 0) + parser(r[sumField]);
  });
  return Object.entries(acc)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/** Agrupa por campo y cuenta. Output ordenado desc. */
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

/** Separa empleados en activos / egresados. */
export function splitByEstado(empleados: ParsedFile | undefined) {
  const activos: ParsedRow[] = [];
  const egresados: ParsedRow[] = [];
  if (!empleados?.rows?.length) return { activos, egresados };

  empleados.rows.forEach((r) => {
    if (norm(r["Estado"]) === "activo") activos.push(r);
    else egresados.push(r);
  });
  return { activos, egresados };
}
