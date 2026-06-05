"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import type { FinanzaData } from "@/lib/finanza/parseFinanza";
import type { MacroData } from "@/lib/finanza/store";
import { Card, KPI, Grid, Table, PageTitle, fmtArs, fmtUsd, fmtNum, fmtPct, fmtDate, fmtMes, type Col } from "./ui";

const sum = (a: (number | null)[]) => a.reduce<number>((s, v) => s + (v ?? 0), 0);

// ─── CTAS CTES ───────────────────────────────────────────────────────────────
export function CtasCtesTab({ d }: { d: FinanzaData["ctasctes"] }) {
  return (
    <div className="space-y-6">
      <PageTitle title="Cuentas Corrientes" sub="Cobranzas MAGNUS (recibos), plazos, vendedores, saldos y cheques rechazados" />
      <Grid cols={4}>
        <KPI label="Plazo ponderado" value={d.plazoAll != null ? `${d.plazoAll.toFixed(1)} d` : "—"} sub="todos los clientes" />
        <KPI label="Plazo s/ OMAR-CAR" value={d.plazoSinOmar != null ? `${d.plazoSinOmar.toFixed(1)} d` : "—"} />
        <KPI label="Cobrado (MAGNUS)" value={fmtArs(d.cobradoTotal)} sub="hoja RECIBOS" accent="green" />
        <KPI label="Recibos MAGNUS / PR" value={fmtArs(d.reciboTotal ? Math.abs(d.reciboTotal.magnus ?? 0) : null)} sub={`PR ${fmtArs(d.reciboTotal ? Math.abs(d.reciboTotal.pr ?? 0) : null)}`} />
      </Grid>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Cobranzas por vendedor (MAGNUS)</h3>
        <Table<{ vendedor: string; cobrado: number }>
          cols={[{ key: "vendedor", label: "Vendedor" }, { key: "cobrado", label: "Cobrado", num: true, render: (r) => fmtArs(r.cobrado) }]}
          rows={d.vendedores} max={50}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Cobranzas (MAGNUS vs PR)</h3>
          <Table cols={pivotCols("MAGNUS", "PR")} rows={d.cobranzas} max={60} />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Saldos a cobrar</h3>
          <Table cols={pivotCols("MAGNUS", "PRUEBA")} rows={d.saldos} max={60} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Cheques rechazados — saldos &gt; 0</h3>
        <Table<{ cliente: string; magnus: number | null; total: number | null }>
          cols={[{ key: "cliente", label: "Cliente" }, { key: "magnus", label: "MAGNUS", num: true, render: (r) => fmtArs(r.magnus) }, { key: "total", label: "Total", num: true, render: (r) => fmtArs(r.total) }]}
          rows={d.chequesRechazadosSaldos} max={60}
        />
      </div>
    </div>
  );
}
function pivotCols(a: string, b: string): Col<{ label: string; magnus: number | null; pr: number | null; total: number | null }>[] {
  return [
    { key: "label", label: "" },
    { key: "magnus", label: a, num: true, render: (r) => fmtArs(r.magnus) },
    { key: "pr", label: b, num: true, render: (r) => fmtArs(r.pr) },
    { key: "total", label: "Total", num: true, render: (r) => fmtArs(r.total) },
  ];
}

// ─── COMERCIO EXTERIOR ─────────────────────────────────────────────────────────
export function ComexTab({ d }: { d: FinanzaData["comex"] }) {
  const totNac = sum(d.resumenMensual.map((m) => m.nac));
  const totFlete = sum(d.resumenMensual.map((m) => m.flete));
  const badge = (txt: string, ok: boolean, neutral?: boolean) => (
    <span className={`text-xs px-2 py-0.5 rounded-full ${neutral ? "bg-zinc-700/40 text-zinc-400" : ok ? "bg-green-400/10 text-green-400" : "bg-yellow-400/10 text-yellow-400"}`}>{txt}</span>
  );
  return (
    <div className="space-y-6">
      <PageTitle title="Comercio Exterior" sub="Resumen mensual (nacionalizaciones + fletes), detalle de operaciones y financiaciones CDI/FIIM (USD)" />
      <Grid cols={3}>
        <KPI label="Nac. pendiente (USD)" value={fmtUsd(totNac)} accent="red" />
        <KPI label="Fletes pendientes (USD)" value={fmtUsd(totFlete)} accent="red" />
        <KPI label="Operaciones (desde 08-2025)" value={fmtNum(d.operaciones.length)} />
      </Grid>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Resumen mensual (USD, por fecha de nacionalización)</h3>
        <Table<{ mes: string; nac: number; flete: number; total: number }>
          cols={[
            { key: "mes", label: "Mes", render: (r) => fmtMes(r.mes) },
            { key: "nac", label: "Nacionalización", num: true, render: (r) => fmtUsd(r.nac) },
            { key: "flete", label: "Flete", num: true, render: (r) => fmtUsd(r.flete) },
            { key: "total", label: "Total", num: true, render: (r) => fmtUsd(r.total) },
          ]}
          rows={d.resumenMensual}
        />
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Financiaciones COMEX (CDI / FIIM)</h3>
        <Table<FinanzaData["comex"]["financiaciones"][number]>
          cols={[
            { key: "tipo", label: "Tipo" }, { key: "banco", label: "Banco" },
            { key: "importe", label: "Importe", num: true, render: (r) => fmtUsd(r.importe) },
            { key: "saldo", label: "Saldo", num: true, render: (r) => fmtUsd(r.saldo) },
            { key: "vto", label: "Vto", render: (r) => fmtDate(r.vto) },
            { key: "pedido", label: "Pedido" },
            { key: "estado", label: "Estado" },
          ]}
          rows={d.financiaciones}
        />
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Operaciones</h3>
        <Table<FinanzaData["comex"]["operaciones"][number]>
          cols={[
            { key: "pedido", label: "Pedido" }, { key: "nombre", label: "Producto" },
            { key: "fecha", label: "Fecha", render: (r) => fmtDate(r.fecha) },
            { key: "nac", label: "Nacionalización", render: (r) => r.nacEstado === "completada" ? badge("OK", true) : badge(r.nacMonto != null ? fmtUsd(r.nacMonto) : "pendiente", false) },
            { key: "flete", label: "Flete", render: (r) => r.fleteEstado === "pagado" ? badge("pagado", true) : r.fleteEstado === "sin_costo" ? badge("sin costo", false, true) : badge(r.fleteMonto != null ? fmtUsd(r.fleteMonto) : "pendiente", false) },
          ]}
          rows={d.operaciones} max={250}
        />
      </div>
    </div>
  );
}

// ─── PROVEEDORES NACIONALES ─────────────────────────────────────────────────────
export function ProveedoresTab({ d }: { d: FinanzaData["proveedores"] }) {
  const totalSaldos = sum(d.saldos.map((s) => s.saldo));
  return (
    <div className="space-y-6">
      <PageTitle title="Proveedores Nacionales" sub="Saldos por pagar, plazo ponderado y pagos del período" />
      <Grid cols={4}>
        <KPI label="Saldo por pagar" value={fmtArs(totalSaldos)} sub={`${d.saldos.length} proveedores`} accent="red" />
        <KPI label="Plazo ponderado (saldos)" value={d.plazoPonderado != null ? `${d.plazoPonderado.toFixed(1)} d` : "—"} />
        <KPI label="Pagos del período" value={fmtArs(d.totalPagos)} sub={`${d.pagos.length} pagos`} accent="green" />
        <KPI label="Plazo ponderado (pagos)" value={d.plazoPagos != null ? `${d.plazoPagos.toFixed(1)} d` : "—"} />
      </Grid>

      <Grid cols={4}>
        {Object.entries(d.clasificacion).map(([k, v]) => (
          <Card key={k} title={k === "<=30" ? "≤ 30 días" : k === "31-60" ? "31–60 días" : k === ">60" ? "> 60 días" : "Sin datos"}>
            <p className="text-lg font-bold text-zinc-200">{fmtArs(v)}</p>
          </Card>
        ))}
      </Grid>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Saldos por proveedor</h3>
        <Table<FinanzaData["proveedores"]["saldos"][number]>
          cols={[
            { key: "nombre", label: "Proveedor" },
            { key: "ultimoMov", label: "Últ. mov.", render: (r) => fmtDate(r.ultimoMov) },
            { key: "plazo", label: "Plazo", num: true, render: (r) => r.plazo != null ? `${r.plazo} d` : "—" },
            { key: "saldo", label: "Saldo", num: true, render: (r) => fmtArs(r.saldo) },
          ]}
          rows={d.saldos} max={100}
        />
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Pagos del período</h3>
        <Table<FinanzaData["proveedores"]["pagos"][number]>
          cols={[
            { key: "fecha", label: "Fecha", render: (r) => fmtDate(r.fecha) },
            { key: "nombre", label: "Proveedor" },
            { key: "dias", label: "Plazo", num: true, render: (r) => r.dias != null ? `${r.dias} d` : "—" },
            { key: "importe", label: "Importe", num: true, render: (r) => fmtArs(r.importe) },
          ]}
          rows={d.pagos} max={150}
        />
      </div>
    </div>
  );
}

// ─── PRESUPUESTOS ───────────────────────────────────────────────────────────────
export function PresupuestosTab({ d }: { d: FinanzaData["presupuestos"] }) {
  const estados = [...new Set(d.porArea.flatMap((a) => Object.keys(a.estados)))];
  return (
    <div className="space-y-6">
      <PageTitle title="Presupuestos / Órdenes de Compra" sub="Importe por área y estado" />
      <Grid cols={3}><KPI label="Total" value={fmtArs(d.total)} /></Grid>
      <div className="rounded-xl bg-[#171717] border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1f1f1f]">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">Área</th>
              {estados.map((e) => <th key={e} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 whitespace-nowrap">{e}</th>)}
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-yellow-400 border-b border-zinc-800">Total</th>
            </tr>
          </thead>
          <tbody>
            {d.porArea.map((a, i) => (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                <td className="px-4 py-2.5 text-zinc-300">{a.area}</td>
                {estados.map((e) => <td key={e} className="px-4 py-2.5 text-right tabular-nums text-zinc-400">{a.estados[e] ? fmtArs(a.estados[e]) : "—"}</td>)}
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-zinc-200">{fmtArs(a.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Matriz mensual genérica (Impuestos / Cash) ─────────────────────────────────
function MatrixTable({ meses, rows }: { meses: string[]; rows: { label: string; values: (number | null)[]; bg?: string; bold?: boolean }[] }) {
  return (
    <div className="rounded-xl bg-[#171717] border border-zinc-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1f1f1f]">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">Concepto</th>
            {meses.map((m, i) => <th key={i} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 whitespace-nowrap">{fmtMes(m)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b border-zinc-800/50 ${r.bg ?? "hover:bg-zinc-900/40"}`}>
              <td className={`px-4 py-2.5 ${r.bold ? "font-semibold text-zinc-100" : "text-zinc-300"}`}>{r.label}</td>
              {r.values.map((v, j) => <td key={j} className={`px-4 py-2.5 text-right tabular-nums ${r.bold ? "font-semibold text-zinc-100" : "text-zinc-300"}`}>{fmtArs(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImpuestosTab({ d }: { d: FinanzaData["impuestos"] }) {
  return (
    <div className="space-y-6">
      <PageTitle title="Impuestos & Laborales" sub="Proyección de haberes, cargas, planes fiscales" />
      <MatrixTable
        meses={d.meses}
        rows={[...d.conceptos.map((c) => ({ label: c.concepto, values: c.valores })), { label: "TOTAL", values: d.total, bold: true, bg: "bg-yellow-400/5" }]}
      />
    </div>
  );
}

// ─── PRESTAMOS ─────────────────────────────────────────────────────────────────
export function PrestamosTab({ d }: { d: FinanzaData["prestamos"] }) {
  const saldoActual = [...d.cuadro].reverse().find((r) => r.saldo != null)?.saldo ?? null;
  return (
    <div className="space-y-6">
      <PageTitle title="Préstamos" sub={d.titulo ?? "Cuadro de amortización"} />
      <Grid cols={3}>
        <KPI label="Monto original" value={fmtArs(d.monto)} />
        <KPI label="Saldo (última cuota)" value={fmtArs(saldoActual)} accent="red" />
        <KPI label="Cuotas" value={fmtNum(d.cuadro.length)} />
      </Grid>
      <Table<FinanzaData["prestamos"]["cuadro"][number]>
        cols={[
          { key: "vencimiento", label: "Vto", render: (r) => fmtDate(r.vencimiento) },
          { key: "capital", label: "Capital", num: true, render: (r) => fmtArs(r.capital) },
          { key: "interes", label: "Interés", num: true, render: (r) => fmtArs(r.interes) },
          { key: "impuesto", label: "Impuesto", num: true, render: (r) => fmtArs(r.impuesto) },
          { key: "cuota", label: "Cuota", num: true, render: (r) => fmtArs(r.cuota) },
          { key: "saldo", label: "Saldo", num: true, render: (r) => fmtArs(r.saldo) },
        ]}
        rows={d.cuadro} max={100}
      />
    </div>
  );
}

// ─── CASH FLOW ───────────────────────────────────────────────────────────────
export function CashTab({ d }: { d: FinanzaData["cash"] }) {
  const rows = d.filas.map((f) => {
    let bg: string | undefined, bold = false;
    if (f.kind === "inicio") { bg = "bg-green-400/5"; bold = true; }
    else if (f.kind === "egresos") { bg = "bg-red-400/10"; bold = true; }
    else if (f.kind === "final") { bg = "bg-yellow-400/5"; bold = true; }
    else if (f.kind === "comex") { bg = "bg-red-400/5"; }
    return { label: f.label, values: f.values, bg, bold };
  });
  return (
    <div className="space-y-6">
      <PageTitle title="Cash Mensual" sub="Posición de caja proyectada · bloque COMEX en USD · saldo final" />
      <MatrixTable meses={d.meses} rows={rows} />
    </div>
  );
}

// ─── MACRO & USD ───────────────────────────────────────────────────────────────
export function MacroTab({ macro, onRefresh }: { macro: MacroData | null; onRefresh: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <PageTitle title="Macro & USD" sub="Tipo de cambio, inflación y tasas en tiempo real (Argentina)" />
        <button onClick={onRefresh} className="flex items-center gap-2 text-xs text-yellow-400 border border-yellow-400/30 rounded-lg px-3 py-2 hover:bg-yellow-400/5">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>
      {!macro ? (
        <div className="py-16 text-center text-zinc-600 text-sm">Sin datos. Tocá «Actualizar».</div>
      ) : (
        <>
          <Grid cols={4}>
            {macro.dolares.map((d) => (
              <KPI key={d.nombre} label={`Dólar ${d.nombre}`} value={fmtArs(d.venta)} sub={d.compra != null ? `compra ${fmtArs(d.compra)}` : undefined} />
            ))}
          </Grid>
          <Grid cols={3}>
            <KPI label="Inflación mensual" value={fmtPct(macro.inflacionMensual)} accent="red" />
            <KPI label="Inflación interanual" value={fmtPct(macro.inflacionInteranual)} accent="red" />
            <KPI label="Plazo fijo TNA (prom.)" value={fmtPct(macro.plazoFijoTNA)} accent="green" />
          </Grid>
          <p className="text-xs text-zinc-600">Actualizado: {fmtDate(macro.fetchedAt)} {new Date(macro.fetchedAt).toLocaleTimeString("es-AR")}</p>
        </>
      )}
    </div>
  );
}
