// Parser del reporte de producción del depósito (WMS).
// Replica la lógica del notebook wms.ipynb sobre el export "prod.csv" (sep ";").

export interface DepRegistro {
  mes: string;          // YYYY-MM
  nombreMes: string;    // Enero, Febrero, ...
  operario: string;
  proceso: string;      // Picking | Libre + Reposicion | Re-Ubicacion
  itemsPedidos: number;        // CANT. ITEM DE RECOLECCION (sum)
  itemsRecolectados: number;   // CANT. ITEM RECOLECTADOS (sum)
  ot: number;                  // cantidad de OT (filas)
}
export interface ProcResumen { proceso: string; recolectados: number; pedidos: number; ot: number }
export interface MesValor { mes: string; nombreMes: string; recolectados: number; pedidos: number; ot: number }

export interface DepositoData {
  fileName: string;
  parsedAt: string;
  filasCsv: number;
  filasValidas: number;
  meses: string[];      // YYYY-MM ordenados
  procesos: string[];
  operarios: string[];
  registros: DepRegistro[];
  porProceso: ProcResumen[];
  porMes: MesValor[];
  resumen: {
    totalRecolectados: number;
    totalPedidos: number;
    totalOT: number;
    operariosActivos: number;
    fillRate: number | null;      // recolectados / pedidos * 100
    ultimoMes: string | null;
    nombreUltimoMes: string | null;
    recolectadosUltimoMes: number;
  };
}

const ORDEN_MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ORDEN_PROC = ["Picking", "Libre + Reposicion", "Re-Ubicacion"];
const GERENTES = new Set(
  ["Carossio Jose", "Martinelli Jose Ignacio", "Boscacci Vladimir", "Mercaderia X Llegar", "****Picatti Alexis", "Buttussi Marcos", "Paola Trosarello", "Mangiafico Emiliano"].map((s) => s.toLowerCase()),
);
const EXCLUIR_REUB = new Set(["Carballo Agustin", "Corzo Agustin", "Munoz Agustin"].map((s) => s.toLowerCase()));
const REUB = new Set(["Libre + Reposicion", "Re-Ubicacion"]);

function sumBy<T>(rows: T[], f: (r: T) => number): number {
  return rows.reduce<number>((s, r) => s + (f(r) || 0), 0);
}
function cleanProc(p: string): string {
  const x = (p ?? "").replace(/[?�]/g, "o").trim();
  if (x === "Libre" || x === "Reposicion") return "Libre + Reposicion";
  return x;
}
function toInt(s: string | undefined): number {
  if (s == null) return 0;
  const t = String(s).trim().replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function parseFecha(s: string | undefined): Date | null {
  if (!s) return null;
  const tok = String(s).trim().split(/\s+/)[0]; // "29/05/2026"
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(tok);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function splitLine(line: string): string[] {
  return line.split(";").map((c) => c.replace(/^﻿/, "").replace(/^"([\s\S]*)"$/, "$1").trim());
}

export function parseDeposito(csv: string, fileName: string): DepositoData {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV vacío o sin filas de datos");

  const header = splitLine(lines[0]).map((h) => h.toUpperCase());
  const col = (name: string) => header.indexOf(name.toUpperCase());
  const iFecha = col("FECHA EJECUCION");
  const iOp = col("OPERARIO");
  const iProc = col("PROCESO");
  const iPed = col("CANT. ITEM DE RECOLECCION");
  const iRec = col("CANT. ITEM RECOLECTADOS");
  if (iFecha < 0 || iOp < 0 || iProc < 0) {
    throw new Error("Faltan columnas requeridas (FECHA EJECUCION, OPERARIO, PROCESO). ¿Es el export de producción?");
  }

  const map = new Map<string, DepRegistro>();
  let filasValidas = 0;
  for (let r = 1; r < lines.length; r++) {
    const c = splitLine(lines[r]);
    const fecha = parseFecha(c[iFecha]);
    if (!fecha) continue;
    const operario = (c[iOp] ?? "").trim();
    if (!operario || GERENTES.has(operario.toLowerCase())) continue;
    const proceso = cleanProc(c[iProc] ?? "");
    if (!proceso) continue;
    if (REUB.has(proceso) && EXCLUIR_REUB.has(operario.toLowerCase())) continue;

    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const mes = `${fecha.getFullYear()}-${mm}`;
    const key = `${mes}|${operario}|${proceso}`;
    let reg = map.get(key);
    if (!reg) {
      reg = { mes, nombreMes: ORDEN_MESES[fecha.getMonth()], operario, proceso, itemsPedidos: 0, itemsRecolectados: 0, ot: 0 };
      map.set(key, reg);
    }
    reg.itemsPedidos += iPed >= 0 ? toInt(c[iPed]) : 0;
    reg.itemsRecolectados += iRec >= 0 ? toInt(c[iRec]) : 0;
    reg.ot += 1;
    filasValidas++;
  }

  const registros = [...map.values()];
  const meses = [...new Set(registros.map((r) => r.mes))].sort();
  const procesos = [...new Set(registros.map((r) => r.proceso))].sort((a, b) => {
    const ia = ORDEN_PROC.indexOf(a), ib = ORDEN_PROC.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const operarios = [...new Set(registros.map((r) => r.operario))].sort();

  const porProceso: ProcResumen[] = procesos.map((p) => {
    const rs = registros.filter((r) => r.proceso === p);
    return { proceso: p, recolectados: sumBy(rs, (r) => r.itemsRecolectados), pedidos: sumBy(rs, (r) => r.itemsPedidos), ot: sumBy(rs, (r) => r.ot) };
  });
  const porMes: MesValor[] = meses.map((m) => {
    const rs = registros.filter((r) => r.mes === m);
    return { mes: m, nombreMes: rs[0]?.nombreMes ?? "", recolectados: sumBy(rs, (r) => r.itemsRecolectados), pedidos: sumBy(rs, (r) => r.itemsPedidos), ot: sumBy(rs, (r) => r.ot) };
  });

  const totalRecolectados = sumBy(registros, (r) => r.itemsRecolectados);
  const totalPedidos = sumBy(registros, (r) => r.itemsPedidos);
  const totalOT = sumBy(registros, (r) => r.ot);
  const ultimoMes = meses.length ? meses[meses.length - 1] : null;
  const ultimoReg = ultimoMes ? registros.filter((r) => r.mes === ultimoMes) : [];

  return {
    fileName,
    parsedAt: new Date().toISOString(),
    filasCsv: lines.length - 1,
    filasValidas,
    meses,
    procesos,
    operarios,
    registros,
    porProceso,
    porMes,
    resumen: {
      totalRecolectados,
      totalPedidos,
      totalOT,
      operariosActivos: operarios.length,
      fillRate: totalPedidos > 0 ? (totalRecolectados / totalPedidos) * 100 : null,
      ultimoMes,
      nombreUltimoMes: ultimoReg[0]?.nombreMes ?? null,
      recolectadosUltimoMes: sumBy(ultimoReg, (r) => r.itemsRecolectados),
    },
  };
}
