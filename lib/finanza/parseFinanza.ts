import * as XLSX from "xlsx";

// ─── Tipos ──────────────────────────────────────────────────────────────────
export type Cell = string | number | boolean | Date | null;
type Matrix = Cell[][];

export interface PivotRow { label: string; magnus: number | null; pr: number | null; total: number | null }
export interface VendedorRow { vendedor: string; cobrado: number }
export interface ComexOp {
  pedido: string | number | null; nombre: string; fecha: string | null; mercaderia: string | null;
  nacEstado: "completada" | "pendiente"; nacMonto: number | null; fechaNac: string | null;
  fleteEstado: "pagado" | "sin_costo" | "pendiente"; fleteMonto: number | null; fechaFlete: string | null;
}
export interface ComexMes { mes: string; nac: number; flete: number; total: number }
export interface FinanciacionRow {
  emision: string | null; tipo: string | null; banco: string | null; divisa: string | null;
  importe: number | null; saldo: number | null; vto: string | null; pedido: string | null; estado: string | null;
}
export interface ProvSaldo { cuenta: string | number | null; nombre: string; ultimoMov: string | null; saldo: number; plazo: number | null }
export interface ProvPago { fecha: string | null; comprobante: string | null; nombre: string; importe: number; dias: number | null }
export interface PresupArea { area: string; estados: Record<string, number>; total: number }
export interface CashRow { label: string; values: (number | null)[]; kind?: "inicio" | "egresos" | "final" | "comex" }
export interface AmortRow { capital: number | null; interes: number | null; impuesto: number | null; cuota: number | null; saldo: number | null; vencimiento: string | null }

export interface FinanzaData {
  fileName: string;
  parsedAt: string;
  periodo: string | null;
  ctasctes: {
    cobranzas: PivotRow[]; reciboTotal: { magnus: number | null; pr: number | null } | null;
    saldos: PivotRow[];
    chequesRechazadosSaldos: { cliente: string; magnus: number | null; prueba: number | null; total: number | null }[];
    plazoAll: number | null; plazoSinOmar: number | null; cobradoTotal: number;
    vendedores: VendedorRow[];
  };
  comex: { operaciones: ComexOp[]; resumenMensual: ComexMes[]; financiaciones: FinanciacionRow[] };
  proveedores: {
    saldos: ProvSaldo[]; plazoPonderado: number | null; clasificacion: Record<string, number>;
    pagos: ProvPago[]; totalPagos: number; plazoPagos: number | null;
  };
  presupuestos: { porArea: PresupArea[]; total: number };
  impuestos: { meses: string[]; conceptos: { concepto: string; valores: (number | null)[] }[]; total: (number | null)[] };
  prestamos: { titulo: string | null; monto: number | null; cuadro: AmortRow[] };
  cash: { meses: string[]; filas: CashRow[] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function num(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const c = v.replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(c);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function str(v: Cell): string { return v === null || v === undefined ? "" : String(v).trim(); }
function up(v: Cell): string { return str(v).toUpperCase(); }
function isDate(v: Cell): v is Date { return v instanceof Date && !isNaN(v.getTime()); }
function iso(v: Cell): string | null { return isDate(v) ? v.toISOString().slice(0, 10) : null; }
function ym(v: Cell): string | null { return isDate(v) ? v.toISOString().slice(0, 7) : null; }

function sheet(wb: XLSX.WorkBook, name: string): Matrix {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
}
const at = (m: Matrix, r: number, c: number): Cell => (m[r] && m[r][c] !== undefined ? m[r][c] : null);
function findRow(m: Matrix, col: number, pred: (s: string) => boolean, from = 0): number {
  for (let r = from; r < m.length; r++) if (pred(up(at(m, r, col)))) return r;
  return -1;
}

// ─── CTAS CTES ──────────────────────────────────────────────────────────────
function parseCtasCtes(wb: XLSX.WorkBook) {
  const m = sheet(wb, "CTAS CTES");
  // Cobranzas: header "Etiquetas de fila" + MAGNUS/PR/Total (≈ fila 5)
  const cobHdr = findRow(m, 0, (s) => s.includes("ETIQUETAS DE FILA"), 0);
  const cobranzas: PivotRow[] = [];
  let reciboTotal: { magnus: number | null; pr: number | null } | null = null;
  if (cobHdr >= 0) {
    for (let r = cobHdr + 1; r < m.length; r++) {
      const label = str(at(m, r, 0));
      if (!label) break;
      const row = { label, magnus: num(at(m, r, 1)), pr: num(at(m, r, 2)), total: num(at(m, r, 3)) };
      cobranzas.push(row);
      if (up(label) === "RECIBO") reciboTotal = { magnus: row.magnus, pr: row.pr };
    }
  }
  // Saldos: header "Etiquetas de fila" + MAGNUS/PRUEBA (segundo bloque, tras "SALDOS CUENTAS")
  const saldoSec = findRow(m, 0, (s) => s.includes("SALDOS CUENTAS"), 0);
  const saldoHdr = saldoSec >= 0 ? findRow(m, 0, (s) => s.includes("ETIQUETAS DE FILA"), saldoSec) : -1;
  const saldos: PivotRow[] = [];
  if (saldoHdr >= 0) {
    for (let r = saldoHdr + 1; r < m.length; r++) {
      const label = str(at(m, r, 0));
      if (!label) break;
      saldos.push({ label, magnus: num(at(m, r, 1)), pr: num(at(m, r, 2)), total: num(at(m, r, 3)) });
    }
  }
  // Saldos cheques rechazados: tras "SALDOS CHEQUES RECHAZADOS" → header MAGNUS/PRUEBA
  const chSec = findRow(m, 0, (s) => s.includes("SALDOS CHEQUES RECHAZADOS"), 0);
  const chHdr = chSec >= 0 ? findRow(m, 0, (s) => s.includes("ETIQUETAS DE FILA"), chSec) : -1;
  const chequesRechazadosSaldos: { cliente: string; magnus: number | null; prueba: number | null; total: number | null }[] = [];
  if (chHdr >= 0) {
    for (let r = chHdr + 1; r < m.length; r++) {
      const cliente = str(at(m, r, 0));
      if (!cliente || up(cliente) === "TOTAL GENERAL") break;
      const magnus = num(at(m, r, 1)), prueba = num(at(m, r, 2)), total = num(at(m, r, 3));
      if ((total ?? magnus ?? 0) > 0) chequesRechazadosSaldos.push({ cliente, magnus, prueba, total });
    }
  }

  // Plazos + vendedores desde RECIBOS COBROS (header en fila 3 0-based)
  const rec = sheet(wb, "RECIBOS COBROS");
  let cobradoTotal = 0, wSum = 0, wSumNoOmar = 0, cSum = 0, cSumNoOmar = 0;
  const vendMap = new Map<string, number>();
  for (let r = 4; r < rec.length; r++) {
    const cobrado = num(at(rec, r, 10));
    const prom = num(at(rec, r, 11));
    const cliente = up(at(rec, r, 5));
    const vendedor = str(at(rec, r, 1));
    if (cobrado === null && !vendedor) continue;
    if (cobrado !== null) {
      cobradoTotal += cobrado;
      if (vendedor) vendMap.set(vendedor, (vendMap.get(vendedor) ?? 0) + cobrado);
      if (prom !== null && prom > 0) {
        wSum += prom * cobrado; cSum += cobrado;
        if (!cliente.includes("OMAR-CAR")) { wSumNoOmar += prom * cobrado; cSumNoOmar += cobrado; }
      }
    }
  }
  const vendedores = [...vendMap.entries()].map(([vendedor, cobrado]) => ({ vendedor, cobrado }))
    .sort((a, b) => b.cobrado - a.cobrado);

  return {
    cobranzas, reciboTotal, saldos, chequesRechazadosSaldos,
    plazoAll: cSum ? wSum / cSum : null,
    plazoSinOmar: cSumNoOmar ? wSumNoOmar / cSumNoOmar : null,
    cobradoTotal, vendedores,
  };
}

// ─── COMERCIO EXTERIOR ────────────────────────────────────────────────────────
function parseComex(wb: XLSX.WorkBook) {
  const m = sheet(wb, "COMEX OP");
  const FROM = new Date("2025-08-01");
  const operaciones: ComexOp[] = [];
  const mesMap = new Map<string, { nac: number; flete: number }>();
  for (let r = 9; r < m.length; r++) {
    const fecha = at(m, r, 3);
    if (!isDate(fecha) || fecha < FROM) continue;
    const nacRaw = at(m, r, 42), fleteRaw = at(m, r, 44);
    const nacU = up(nacRaw), fleteU = up(fleteRaw);
    if (nacU === "ANULADA" || nacU === "NO APLICA") continue;
    const nacNum = typeof nacRaw === "number" ? nacRaw : null;
    const fleteNum = typeof fleteRaw === "number" ? fleteRaw : null;
    const nacEstado: ComexOp["nacEstado"] = nacU === "NACIONALIZADA" || nacU === "PAGADA" ? "completada" : "pendiente";
    let fleteEstado: ComexOp["fleteEstado"] = "pendiente";
    if (["PAGADO", "PAGADP", "PAGADA"].includes(fleteU)) fleteEstado = "pagado";
    else if (fleteU === "SIN COSTO") fleteEstado = "sin_costo";
    const fechaNac = at(m, r, 43);
    operaciones.push({
      pedido: (at(m, r, 1) as string | number | null), nombre: str(at(m, r, 2)), fecha: iso(fecha),
      mercaderia: str(at(m, r, 37)) || null, nacEstado, nacMonto: nacNum, fechaNac: iso(fechaNac),
      fleteEstado, fleteMonto: fleteNum, fechaFlete: iso(at(m, r, 45)),
    });
    const k = ym(fechaNac);
    if (k && ((nacNum ?? 0) > 0 || (fleteNum ?? 0) > 0)) {
      const cur = mesMap.get(k) ?? { nac: 0, flete: 0 };
      if ((nacNum ?? 0) > 0) cur.nac += nacNum!;
      if ((fleteNum ?? 0) > 0) cur.flete += fleteNum!;
      mesMap.set(k, cur);
    }
  }
  const resumenMensual: ComexMes[] = [...mesMap.entries()].sort()
    .map(([mes, v]) => ({ mes, nac: v.nac, flete: v.flete, total: v.nac + v.flete }));

  // FINANCIACIONES COMEX: header OPERACIÓN/EMISION/TIPO/BANCO...
  const fm = sheet(wb, "FINANCIACIONES COMEX");
  const fHdr = findRow(fm, 2, (s) => s === "TIPO", 0);
  const financiaciones: FinanciacionRow[] = [];
  if (fHdr >= 0) {
    for (let r = fHdr + 1; r < fm.length; r++) {
      const tipo = str(at(fm, r, 2)), banco = str(at(fm, r, 3));
      const importe = num(at(fm, r, 5));
      if (!tipo && !banco && importe === null) continue;
      financiaciones.push({
        emision: iso(at(fm, r, 1)), tipo: tipo || null, banco: banco || null, divisa: str(at(fm, r, 4)) || null,
        importe, saldo: num(at(fm, r, 6)), vto: iso(at(fm, r, 7)), pedido: str(at(fm, r, 8)) || null, estado: str(at(fm, r, 9)) || null,
      });
    }
  }
  return { operaciones, resumenMensual, financiaciones };
}

// ─── PROVEEDORES NACIONALES ───────────────────────────────────────────────────
function parseProveedores(wb: XLSX.WorkBook) {
  const m = sheet(wb, "NACIONALES");
  // Plazos desde BASE DATOS PROV (sin header): col0=cuenta col2=plazo
  const bp = sheet(wb, "BASE DATOS PROV");
  const plazoBy = new Map<string, number>();
  for (let r = 0; r < bp.length; r++) {
    const cuenta = num(at(bp, r, 0)); const plazo = num(at(bp, r, 2));
    if (cuenta !== null && plazo !== null) plazoBy.set(String(cuenta), plazo);
  }
  // Sección 1: header "Cuenta" → Saldo>0
  const s1 = findRow(m, 0, (s) => s === "CUENTA", 0);
  const saldos: ProvSaldo[] = [];
  if (s1 >= 0) {
    for (let r = s1 + 1; r < m.length; r++) {
      const cuenta = at(m, r, 0); const nombre = str(at(m, r, 1));
      if (!nombre && cuenta === null) { if (str(at(m, r, 0)) === "" && str(at(m, r, 1)) === "") continue; }
      const saldo = num(at(m, r, 3));
      if (cuenta === null && !nombre) continue;
      if (saldo === null || saldo <= 0) continue;
      const cuentaNum = num(at(m, r, 0));
      const key = String(cuentaNum ?? str(cuenta));
      saldos.push({ cuenta: cuentaNum ?? (str(cuenta) || null), nombre, ultimoMov: iso(at(m, r, 2)), saldo, plazo: plazoBy.get(key) ?? null });
    }
  }
  saldos.sort((a, b) => b.saldo - a.saldo);
  let wS = 0, cS = 0; const clas: Record<string, number> = { "<=30": 0, "31-60": 0, ">60": 0, "sin datos": 0 };
  for (const p of saldos) {
    if (p.plazo !== null) {
      wS += p.saldo * p.plazo; cS += p.saldo;
      if (p.plazo <= 30) clas["<=30"] += p.saldo; else if (p.plazo <= 60) clas["31-60"] += p.saldo; else clas[">60"] += p.saldo;
    } else clas["sin datos"] += p.saldo;
  }
  // Sección 2: ORDES DE PAGO → header Fecha/Comprobante/.../Importe(col4)/PromedioPago(col5)/CONCEPTO(col6)
  const s2 = findRow(m, 0, (s) => s.includes("ORDES DE PAGO") || s.includes("ÓRDENES DE PAGO"), s1 >= 0 ? s1 : 0);
  const pagos: ProvPago[] = [];
  let totalPagos = 0, wP = 0, cP = 0;
  if (s2 >= 0) {
    for (let r = s2 + 2; r < m.length; r++) {
      const importe = num(at(m, r, 4));
      const conceptoZero = num(at(m, r, 6));
      const nombre = str(at(m, r, 3));
      if (importe === null && !nombre) continue;
      if (conceptoZero !== 0) continue; // filtro col G == 0
      if (importe === null) continue;
      const dias = num(at(m, r, 5));
      pagos.push({ fecha: iso(at(m, r, 0)), comprobante: str(at(m, r, 1)) || null, nombre, importe, dias });
      totalPagos += importe;
      if (dias !== null && dias > 0) { wP += importe * dias; cP += importe; }
    }
  }
  return {
    saldos, plazoPonderado: cS ? wS / cS : null, clasificacion: clas,
    pagos, totalPagos, plazoPagos: cP ? wP / cP : null,
  };
}

// ─── PRESUPUESTOS ───────────────────────────────────────────────────────────
function parsePresupuestos(wb: XLSX.WorkBook) {
  const m = sheet(wb, "PRESUPUESTOS");
  const map = new Map<string, Map<string, number>>();
  let total = 0;
  for (let r = 1; r < m.length; r++) {
    const area = str(at(m, r, 1)); if (!area) continue;
    const estado = str(at(m, r, 2)) || "SIN ESTADO";
    const importe = num(at(m, r, 26)); if (importe === null) continue;
    if (!map.has(area)) map.set(area, new Map());
    const em = map.get(area)!; em.set(estado, (em.get(estado) ?? 0) + importe); total += importe;
  }
  const porArea: PresupArea[] = [...map.entries()].map(([area, em]) => {
    const estados = Object.fromEntries(em); const t = [...em.values()].reduce((a, b) => a + b, 0);
    return { area, estados, total: t };
  }).sort((a, b) => b.total - a.total);
  return { porArea, total };
}

// ─── IMPUESTOS Y SUELDOS ──────────────────────────────────────────────────────
function parseImpuestos(wb: XLSX.WorkBook) {
  const m = sheet(wb, "IMPUESTOS Y SUELDOS");
  // iloc[2:17, 8:13] → row2 meses (cols 9..12), conceptos col8, valores 9..12, total fila TOTAL
  const meses: string[] = [];
  for (let c = 9; c <= 12; c++) { const v = at(m, 2, c); meses.push(ym(v) ?? str(v)); }
  const conceptos: { concepto: string; valores: (number | null)[] }[] = [];
  let total: (number | null)[] = [null, null, null, null];
  for (let r = 4; r <= 16; r++) {
    const concepto = str(at(m, r, 8)); if (!concepto) continue;
    const valores = [9, 10, 11, 12].map((c) => num(at(m, r, c)));
    if (up(concepto) === "TOTAL") { total = valores; continue; }
    conceptos.push({ concepto, valores });
  }
  return { meses, conceptos, total };
}

// ─── PRESTAMOS NACIONALES ─────────────────────────────────────────────────────
function parsePrestamos(wb: XLSX.WorkBook) {
  const m = sheet(wb, "PRESTAMOS NACIONALES");
  const titulo = str(at(m, 0, 1)) || null;
  const monto = num(at(m, 1, 1));
  const hdr = findRow(m, 1, (s) => s === "CAPITAL", 0);
  const cuadro: AmortRow[] = [];
  if (hdr >= 0) {
    for (let r = hdr + 1; r < m.length; r++) {
      const capital = num(at(m, r, 1));
      const venc = at(m, r, 8);
      if (capital === null && !isDate(venc)) continue;
      cuadro.push({
        capital, interes: num(at(m, r, 2)), impuesto: num(at(m, r, 3)),
        cuota: num(at(m, r, 6)), saldo: num(at(m, r, 7)), vencimiento: iso(venc),
      });
    }
  }
  return { titulo, monto, cuadro };
}

// ─── CASH FLOW MENSUAL ────────────────────────────────────────────────────────
function parseCash(wb: XLSX.WorkBook) {
  const m = sheet(wb, "CASH FLOW MENSUAL");
  const hdr = findRow(m, 1, (s) => s === "MES", 0);
  const meses: string[] = [];
  if (hdr >= 0) for (let c = 2; c <= 5; c++) { const v = at(m, hdr, c); meses.push(ym(v) ?? str(v)); }
  const COMEX = new Set(["FINANCIACIONES COMEX", "PROVEEDORES COMEX", "NACIONALIZACIONES", "FLETES COMEX"]);
  const filas: CashRow[] = [];
  const end = Math.min(m.length, (hdr >= 0 ? hdr : 6) + 65);
  for (let r = (hdr >= 0 ? hdr + 1 : 7); r < end; r++) {
    const label = str(at(m, r, 1)); if (!label) continue;
    const values = [2, 3, 4, 5].map((c) => num(at(m, r, c)));
    const L = up(label);
    let kind: CashRow["kind"] | undefined;
    if (L.includes("TOTAL DISPONIBLE AL INICIO")) kind = "inicio";
    else if (L === "TOTAL EGRESOS") kind = "egresos";
    else if (L.includes("SALDO DE CAJA") && L.includes("FINAL")) kind = "final";
    else if (COMEX.has(L)) kind = "comex";
    filas.push({ label, values, kind });
  }
  return { meses, filas };
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export function parseFinanzaWorkbook(buf: ArrayBuffer | Buffer, fileName: string): FinanzaData {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ctas = sheet(wb, "CTAS CTES");
  const periodo = iso(at(ctas, 0, 4)) ?? (fileName.match(/(\d{4})[_-](\d{2})/)?.slice(1).join("-") ?? null);
  return {
    fileName, parsedAt: new Date().toISOString(), periodo,
    ctasctes: parseCtasCtes(wb),
    comex: parseComex(wb),
    proveedores: parseProveedores(wb),
    presupuestos: parsePresupuestos(wb),
    impuestos: parseImpuestos(wb),
    prestamos: parsePrestamos(wb),
    cash: parseCash(wb),
  };
}
