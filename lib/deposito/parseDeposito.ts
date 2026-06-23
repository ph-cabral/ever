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

interface DepMeta { fileName: string; parsedAt: string; filasCsv: number; filasValidas: number }

// Acumula una fila (de CSV o de SQL) en el map. Devuelve true si fue válida.
// Aplica las mismas reglas de negocio que el reporte original (gerentes, reub).
function acumular(
  map: Map<string, DepRegistro>,
  fechaRaw: unknown,
  operarioRaw: unknown,
  procRaw: unknown,
  pedRaw: unknown,
  recRaw: unknown,
): boolean {
  const fecha = parseFecha(fechaRaw == null ? undefined : String(fechaRaw));
  if (!fecha) return false;
  const operario = String(operarioRaw ?? "").trim();
  if (!operario || GERENTES.has(operario.toLowerCase())) return false;
  const proceso = cleanProc(String(procRaw ?? ""));
  if (!proceso) return false;
  if (REUB.has(proceso) && EXCLUIR_REUB.has(operario.toLowerCase())) return false;

  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const mes = `${fecha.getFullYear()}-${mm}`;
  const key = `${mes}|${operario}|${proceso}`;
  let reg = map.get(key);
  if (!reg) {
    reg = { mes, nombreMes: ORDEN_MESES[fecha.getMonth()], operario, proceso, itemsPedidos: 0, itemsRecolectados: 0, ot: 0 };
    map.set(key, reg);
  }
  reg.itemsPedidos += toInt(pedRaw == null ? undefined : String(pedRaw));
  reg.itemsRecolectados += toInt(recRaw == null ? undefined : String(recRaw));
  reg.ot += 1;
  return true;
}

// Construye DepositoData (agregados) a partir de registros ya acumulados.
function buildDeposito(registros: DepRegistro[], meta: DepMeta): DepositoData {
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
    fileName: meta.fileName,
    parsedAt: meta.parsedAt,
    filasCsv: meta.filasCsv,
    filasValidas: meta.filasValidas,
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
    if (acumular(map, c[iFecha], c[iOp], c[iProc], iPed >= 0 ? c[iPed] : undefined, iRec >= 0 ? c[iRec] : undefined)) {
      filasValidas++;
    }
  }

  return buildDeposito([...map.values()], {
    fileName,
    parsedAt: new Date().toISOString(),
    filasCsv: lines.length - 1,
    filasValidas,
  });
}

// Construye DepositoData desde las filas JSON de /api/deposito/wms.
// Columnas: "FECHA EJECUCION" (dd/mm/yyyy), "OPERARIO", "PROCESO" (sin acentos),
// "CANT. ITEM DE RECOLECCION", "CANT. ITEM RECOLECTADOS".
export function parseDepositoRows(rows: Record<string, unknown>[], fileName: string): DepositoData {
  const map = new Map<string, DepRegistro>();
  let filasValidas = 0;
  for (const row of rows) {
    if (
      acumular(
        map,
        row["FECHA EJECUCION"],
        row["OPERARIO"],
        row["PROCESO"],
        row["CANT. ITEM DE RECOLECCION"],
        row["CANT. ITEM RECOLECTADOS"],
      )
    ) {
      filasValidas++;
    }
  }
  return buildDeposito([...map.values()], {
    fileName,
    parsedAt: new Date().toISOString(),
    filasCsv: rows.length,
    filasValidas,
  });
}

// Filtra un DepositoData ya parseado por operario y recalcula los agregados.
export function filterDepositoByOperario(data: DepositoData, operario: string): DepositoData {
  if (!operario || operario === "__all__") return data;
  const registros = data.registros.filter((r) => r.operario === operario);
  return buildDeposito(registros, {
    fileName: data.fileName,
    parsedAt: data.parsedAt,
    filasCsv: data.filasCsv,
    filasValidas: sumBy(registros, (r) => r.ot),
  });
}
