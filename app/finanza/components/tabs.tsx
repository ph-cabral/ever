"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import type { FinanzaData } from "@/lib/finanza/parseFinanza";
import type { MacroData } from "@/lib/finanza/store";
import {
  PageTitle,
  SectionTitle,
  Panel,
  KPI,
  Grid,
  Tag,
  Progress,
  Table,
  ChartBar,
  ChartLine,
  ChartDonut,
  PALETTE,
  fmtArs,
  fmtUsd,
  fmtNum,
  fmtPct,
  fmtDate,
  fmtMes,
  fmtShort,
  type Col,
  type Serie,
} from "./ui";

const sum = (a: (number | null | undefined)[]) =>
  a.reduce<number>((s, v) => s + (v ?? 0), 0);
const clip = (s: string, n = 22) => (s.length > n ? s.slice(0, n) + "…" : s);

type RiskTone = "red" | "amber" | "orange" | "neutral";
function riskTag(n: number) {
  const t: RiskTone =
    n >= 3_000_000
      ? "red"
      : n >= 1_500_000
        ? "amber"
        : n >= 800_000
          ? "orange"
          : "neutral";
  const l =
    t === "red"
      ? "CRÍTICO"
      : t === "amber"
        ? "ALTO"
        : t === "orange"
          ? "MODERADO"
          : "—";
  return <Tag tone={t}>{l}</Tag>;
}

type MatRow = {
  label: string;
  cells: React.ReactNode[];
  bold?: boolean;
  rowTone?: "total" | "neg" | "pos" | "comex";
};
function MatrixTable({
  head,
  rows,
  firstLabel = "Concepto",
}: {
  head: string[];
  rows: MatRow[];
  firstLabel?: string;
}) {
  const bg: Record<string, string> = {
    total: "bg-yellow-400/5",
    neg: "bg-red-400/5",
    pos: "bg-green-400/5",
    comex: "bg-red-400/[0.06]",
  };
  return (
    <div className="rounded-lg bg-[#171717] border border-zinc-800 overflow-auto">
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#1f1f1f]">
            <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 sticky left-0 bg-[#1f1f1f]">
              {firstLabel}
            </th>
            {head.map((h, i) => (
              <th
                key={i}
                className="px-2.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={`border-b border-zinc-800/60 ${r.rowTone ? bg[r.rowTone] : "hover:bg-[#1f1f1f]"}`}
            >
              <td
                className={`px-2.5 py-1.5 sticky left-0 ${r.rowTone ? bg[r.rowTone] : "bg-[#171717]"} ${r.bold ? "font-semibold text-zinc-100" : "text-zinc-300"}`}
              >
                {r.label}
              </td>
              {r.cells.map((c, j) => (
                <td
                  key={j}
                  className={`px-2.5 py-1.5 text-right tabular-nums ${r.bold ? "font-semibold text-zinc-100" : "text-zinc-300"}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pivotCols(
  a: string,
  b: string,
): Col<FinanzaData["ctasctes"]["cobranzas"][number]>[] {
  return [
    { key: "label", label: "Etiqueta" },
    { key: "magnus", label: a, num: true, render: (r) => fmtArs(r.magnus) },
    { key: "pr", label: b, num: true, render: (r) => fmtArs(r.pr) },
    { key: "total", label: "Total", num: true, render: (r) => fmtArs(r.total) },
  ];
}

// ─── CTAS CTES ───────────────────────────────────────────────────────────────
export function CtasCtesTab({ d }: { d: FinanzaData["ctasctes"] }) {
  const saldoTot = d.saldos.find((s) => /total/i.test(s.label));
  const saldoDeudores = saldoTot
    ? saldoTot.total
    : sum(d.saldos.map((s) => s.total));
  const chRechTotal = sum(d.chequesRechazadosSaldos.map((c) => c.total));
  const vendSorted = [...d.vendedores].sort((a, b) => b.cobrado - a.cobrado);
  const year2026 = d.cobranzas.find((c) => c.label === "2026");
  const cobradoYTD =
    year2026?.magnus != null ? Math.abs(year2026.magnus) : null;
  const cobrPlazoData = d.cobrPlazo.map((b, i) => ({
    name: b.bucket,
    value: b.monto,
    color: PALETTE[i],
  }));
  const rechMensualData = d.rechazosMensual.map((r) => ({
    mes: fmtMes(r.mes),
    indice: r.cobranzas ? (r.rechazado / r.cobranzas) * 100 : 0,
  }));
  const rechAnualData = d.rechazosAnual.map((a) => ({
    anio: a.anio,
    monto: a.monto,
  }));
  const topVend = vendSorted
    .slice(0, 12)
    .map((v) => ({ vendedor: clip(v.vendedor), cobrado: v.cobrado }));
  const vendRows = vendSorted.map((v, i) => ({
    rank: i + 1,
    vendedor: v.vendedor,
    cobrado: v.cobrado,
  }));

  return (
    <div>
      <PageTitle
        title="Cuentas Corrientes"
        sub="Cobranzas MAGNUS (recibos), plazos por vendedor, saldos y cheques rechazados"
      />

      <Grid cols={6}>
        <KPI
          label="Cobrado mes (MAGNUS)"
          value={fmtArs(d.cobradoTotal)}
          sub="hoja RECIBOS"
          accent="green"
        />
        <KPI
          label="Cobrado YTD"
          value={fmtArs(cobradoYTD)}
          sub="año en curso"
          accent="green"
        />
        <KPI
          label="Cobranzas +80 días"
          value={fmtArs(d.cobrado80)}
          accent="amber"
        />
        <KPI
          label="Recibos PR"
          value={fmtArs(
            d.reciboTotal?.pr != null ? Math.abs(d.reciboTotal.pr) : null,
          )}
          accent="neutral"
        />
        <KPI
          label="Plazo ponderado"
          value={d.plazoAll != null ? `${d.plazoAll.toFixed(1)} d` : "—"}
          accent="amber"
        />
        <KPI
          label="Plazo s/ OMAR-CAR"
          value={
            d.plazoSinOmar != null ? `${d.plazoSinOmar.toFixed(1)} d` : "—"
          }
          accent="neutral"
        />
        <KPI
          label="Saldo deudores"
          value={fmtArs(saldoDeudores)}
          accent="yellow"
        />
        <KPI
          label="Cheques rechazados"
          value={fmtArs(chRechTotal)}
          sub={`${d.chequesRechazadosSaldos.length} clientes`}
          accent="red"
        />
      </Grid>

      <SectionTitle>💰 Cobranzas por Vendedor — MAGNUS</SectionTitle>
      <Panel title="Top vendedores por cobranza" accent="(hoja RECIBOS)">
        <ChartBar
          data={topVend}
          xKey="vendedor"
          horizontal
          height={Math.max(220, topVend.length * 26)}
          series={[{ key: "cobrado", name: "Cobrado", color: PALETTE[0] }]}
        />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Detalle por vendedor
          </h4>
          <Table<{ rank: number; vendedor: string; cobrado: number }>
            cols={[
              { key: "rank", label: "#", num: true },
              { key: "vendedor", label: "Vendedor" },
              {
                key: "cobrado",
                label: "Cobrado",
                num: true,
                render: (r) => fmtArs(r.cobrado),
              },
            ]}
            rows={vendRows}
            max={50}
            maxH={420}
          />
          <div className="mt-3 rounded-lg bg-[#1f1f1f] border border-zinc-800 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Plazo promedio ponderado
            </p>
            <Progress
              label="Con todos los clientes"
              pct={d.plazoAll != null ? Math.min(100, d.plazoAll) : 0}
              value={d.plazoAll != null ? `${d.plazoAll.toFixed(1)} d` : "—"}
              tone="yellow"
              labelMin={170}
            />
            {d.plazoSinOmar != null && (
              <Progress
                label="Sin OMAR-CAR"
                pct={Math.min(100, d.plazoSinOmar)}
                value={`${d.plazoSinOmar.toFixed(1)} d`}
                tone="green"
                labelMin={170}
              />
            )}
          </div>
        </div>
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Cobranzas — MAGNUS vs PR
          </h4>
          <Table
            cols={pivotCols("MAGNUS", "PR")}
            rows={d.cobranzas}
            max={60}
            maxH={500}
          />
        </div>
      </div>

      <SectionTitle>📈 Cobranzas por Plazo & Índice de Rechazo</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Distribución de cobranzas por plazo" accent="($)">
          <ChartDonut
            data={cobrPlazoData}
            height={260}
            fmt={(n) => fmtShort(n)}
          />
        </Panel>
        <Panel
          title="Índice de rechazo mensual"
          accent="(% rech/cobr · año corriente)"
        >
          <ChartLine
            data={rechMensualData}
            xKey="mes"
            height={260}
            series={[{ key: "indice", name: "Índice %", color: PALETTE[5] }]}
            fmt={(n) => `${n.toFixed(2)}%`}
          />
        </Panel>
      </div>
      <div className="mt-4">
        <Panel title="Monto rechazado anual" accent="($)">
          <ChartBar
            data={rechAnualData}
            xKey="anio"
            height={220}
            series={[{ key: "monto", name: "Rechazado", color: PALETTE[5] }]}
            fmt={(n) => fmtShort(n)}
            showValues
          />
        </Panel>
      </div>

      <SectionTitle>🔴 Cheques Rechazados — Saldos Vigentes</SectionTitle>
      <Table<FinanzaData["ctasctes"]["chequesRechazadosSaldos"][number]>
        cols={[
          { key: "cliente", label: "Cliente" },
          {
            key: "magnus",
            label: "MAGNUS",
            num: true,
            render: (r) => fmtArs(r.magnus),
          },
          {
            key: "total",
            label: "Saldo",
            num: true,
            render: (r) => (
              <span className="text-red-400">{fmtArs(r.total)}</span>
            ),
          },
          {
            key: "riesgo",
            label: "Riesgo",
            render: (r) => riskTag(r.total ?? 0),
          },
        ]}
        rows={[...d.chequesRechazadosSaldos].sort(
          (a, b) => (b.total ?? 0) - (a.total ?? 0),
        )}
        max={60}
        maxH={400}
      />

      <SectionTitle>📊 Saldos a Cobrar — MAGNUS vs PR</SectionTitle>
      <Table
        cols={pivotCols("MAGNUS", "PRUEBA")}
        rows={d.saldos}
        max={80}
        maxH={420}
      />
    </div>
  );
}

// ─── COMERCIO EXTERIOR ─────────────────────────────────────────────────────────
export function ComexTab({ d }: { d: FinanzaData["comex"] }) {
  const totNac = sum(d.resumenMensual.map((m) => m.nac));
  const totFlete = sum(d.resumenMensual.map((m) => m.flete));
  const finSaldo = sum(d.financiaciones.map((f) => f.saldo));
  const cdiSaldo = sum(
    d.financiaciones
      .filter((f) => /CDI/i.test(f.tipo ?? ""))
      .map((f) => f.saldo),
  );
  const fiimSaldo = sum(
    d.financiaciones
      .filter((f) => /FIIM/i.test(f.tipo ?? ""))
      .map((f) => f.saldo),
  );
  const pendientes = d.operaciones.filter(
    (o) => o.nacEstado === "pendiente",
  ).length;
  const chartData = d.resumenMensual.map((m) => ({
    mes: fmtMes(m.mes),
    nac: m.nac,
    flete: m.flete,
  }));

  return (
    <div>
      <PageTitle
        title="Comercio Exterior"
        sub="Nacionalizaciones, fletes, operaciones y financiaciones CDI/FIIM (USD)"
      />

      <Grid cols={6}>
        <KPI
          label="Nac. pendiente"
          value={fmtUsd(totNac)}
          sub="por nacionalizar"
          accent="red"
        />
        <KPI
          label="Fletes pendientes"
          value={fmtUsd(totFlete)}
          accent="amber"
        />
        <KPI
          label="Exposición total"
          value={fmtUsd(totNac + totFlete + finSaldo)}
          sub="Nac + Fletes + Fin."
          accent="yellow"
        />
        <KPI
          label="Financ. CDI (saldo)"
          value={fmtUsd(cdiSaldo)}
          accent="red"
        />
        <KPI
          label="Financ. FIIM (saldo)"
          value={fmtUsd(fiimSaldo)}
          accent="red"
        />
        <KPI
          label="Operaciones"
          value={fmtNum(d.operaciones.length)}
          accent="neutral"
        />
        <KPI
          label="Pendientes nac."
          value={fmtNum(pendientes)}
          accent="amber"
        />
      </Grid>

      <SectionTitle>📅 Resumen Mensual — Nacionalización + Flete</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Table<FinanzaData["comex"]["resumenMensual"][number]>
          cols={[
            { key: "mes", label: "Mes", render: (r) => fmtMes(r.mes) },
            {
              key: "nac",
              label: "Nac. (USD)",
              num: true,
              render: (r) => fmtUsd(r.nac),
            },
            {
              key: "flete",
              label: "Flete (USD)",
              num: true,
              render: (r) => fmtUsd(r.flete),
            },
            {
              key: "total",
              label: "Total (USD)",
              num: true,
              render: (r) => <strong>{fmtUsd(r.total)}</strong>,
            },
          ]}
          rows={d.resumenMensual}
          max={24}
        />
        <Panel title="Pendientes por mes" accent="(USD)">
          <ChartBar
            data={chartData}
            xKey="mes"
            height={220}
            series={[
              { key: "nac", name: "Nacionalización", color: PALETTE[5] },
              { key: "flete", name: "Flete", color: PALETTE[2] },
            ]}
            fmt={(n) => fmtShort(n, "US$")}
          />
        </Panel>
      </div>

      <SectionTitle>📦 Operaciones Pendientes</SectionTitle>
      <Table<FinanzaData["comex"]["operaciones"][number]>
        cols={[
          {
            key: "pedido",
            label: "Pedido",
            render: (r) => String(r.pedido ?? "—"),
          },
          {
            key: "nombre",
            label: "Producto",
            render: (r) => r.nombre || r.mercaderia || "—",
          },
          { key: "fecha", label: "Registr.", render: (r) => fmtDate(r.fecha) },
          {
            key: "nac",
            label: "Nacionalización",
            render: (r) =>
              r.nacEstado === "completada" ? (
                <Tag tone="green">OK</Tag>
              ) : (
                <Tag tone="amber">
                  {r.nacMonto != null ? fmtUsd(r.nacMonto) : "PENDIENTE"}
                </Tag>
              ),
          },
          {
            key: "fechaNac",
            label: "Vto. Nac.",
            render: (r) => fmtDate(r.fechaNac),
          },
          {
            key: "flete",
            label: "Flete",
            render: (r) =>
              r.fleteEstado === "pagado" ? (
                <Tag tone="green">pagado</Tag>
              ) : r.fleteEstado === "sin_costo" ? (
                <Tag tone="neutral">sin costo</Tag>
              ) : (
                <Tag tone="amber">
                  {r.fleteMonto != null ? fmtUsd(r.fleteMonto) : "PEND."}
                </Tag>
              ),
          },
        ]}
        rows={d.operaciones}
        max={300}
        maxH={520}
      />

      <SectionTitle>🏦 Financiaciones COMEX (CDI / FIIM)</SectionTitle>
      <Table<FinanzaData["comex"]["financiaciones"][number]>
        cols={[
          { key: "tipo", label: "Tipo", render: (r) => r.tipo ?? "—" },
          { key: "banco", label: "Banco", render: (r) => r.banco ?? "—" },
          {
            key: "importe",
            label: "Importe",
            num: true,
            render: (r) => fmtUsd(r.importe),
          },
          {
            key: "saldo",
            label: "Saldo",
            num: true,
            render: (r) => (
              <span className="text-red-400">{fmtUsd(r.saldo)}</span>
            ),
          },
          { key: "vto", label: "Vto", render: (r) => fmtDate(r.vto) },
          { key: "pedido", label: "Pedido", render: (r) => r.pedido ?? "—" },
          { key: "estado", label: "Estado", render: (r) => r.estado ?? "—" },
        ]}
        rows={d.financiaciones}
        max={60}
      />
    </div>
  );
}

// ─── PROVEEDORES NACIONALES ─────────────────────────────────────────────────────
const CLAS_LABEL: Record<string, string> = {
  "<=30": "≤ 30 días",
  "31-60": "31–60 días",
  ">60": "> 60 días",
  sin: "Sin datos",
  "": "Sin datos",
};
export function ProveedoresTab({ d }: { d: FinanzaData["proveedores"] }) {
  const totalSaldos = sum(d.saldos.map((s) => s.saldo));
  const top10 = [...d.saldos]
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 10)
    .map((s) => ({ nombre: clip(s.nombre, 20), saldo: s.saldo }));
  const clasData = Object.entries(d.clasificacion).map(([k, v], i) => ({
    name: CLAS_LABEL[k] ?? k,
    value: v,
    color: PALETTE[i],
  }));

  return (
    <div>
      <PageTitle
        title="Proveedores Nacionales"
        sub="Saldos por pagar, plazo ponderado y pagos del período"
      />

      <Grid cols={4}>
        <KPI
          label="Saldo por pagar"
          value={fmtArs(totalSaldos)}
          sub={`${d.saldos.length} proveedores`}
          accent="red"
        />
        <KPI
          label="Plazo ponderado (saldos)"
          value={
            d.plazoPonderado != null ? `${d.plazoPonderado.toFixed(1)} d` : "—"
          }
          accent="amber"
        />
        <KPI
          label="Pagos del período"
          value={fmtArs(d.totalPagos)}
          sub={`${d.pagos.length} pagos`}
          accent="green"
        />
        <KPI
          label="Plazo ponderado (pagos)"
          value={d.plazoPagos != null ? `${d.plazoPagos.toFixed(1)} d` : "—"}
          accent="neutral"
        />
      </Grid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        <Panel title="Top 10 proveedores por saldo" accent="($)">
          <ChartBar
            data={top10}
            xKey="nombre"
            horizontal
            height={300}
            series={[{ key: "saldo", name: "Saldo", color: PALETTE[5] }]}
          />
        </Panel>
        <Panel title="Distribución por plazo de pago">
          <ChartDonut data={clasData} height={300} fmt={(n) => fmtShort(n)} />
        </Panel>
      </div>

      <SectionTitle>📋 Saldo por Proveedor</SectionTitle>
      <Table<FinanzaData["proveedores"]["saldos"][number]>
        cols={[
          { key: "nombre", label: "Proveedor" },
          {
            key: "ultimoMov",
            label: "Últ. mov.",
            render: (r) => fmtDate(r.ultimoMov),
          },
          {
            key: "plazo",
            label: "Plazo",
            num: true,
            render: (r) => (r.plazo != null ? `${r.plazo} d` : "—"),
          },
          {
            key: "saldo",
            label: "Saldo",
            num: true,
            render: (r) => fmtArs(r.saldo),
          },
        ]}
        rows={[...d.saldos].sort((a, b) => b.saldo - a.saldo)}
        max={120}
        maxH={460}
      />

      <SectionTitle>💳 Pagos del Período</SectionTitle>
      <Table<FinanzaData["proveedores"]["pagos"][number]>
        cols={[
          { key: "fecha", label: "Fecha", render: (r) => fmtDate(r.fecha) },
          { key: "nombre", label: "Proveedor" },
          {
            key: "dias",
            label: "Plazo",
            num: true,
            render: (r) => (r.dias != null ? `${r.dias} d` : "—"),
          },
          {
            key: "importe",
            label: "Importe",
            num: true,
            render: (r) => fmtArs(r.importe),
          },
        ]}
        rows={d.pagos}
        max={150}
        maxH={460}
      />
    </div>
  );
}

// ─── PRESUPUESTOS ───────────────────────────────────────────────────────────────
export function PresupuestosTab({ d }: { d: FinanzaData["presupuestos"] }) {
  const estados = [
    ...new Set(d.porArea.flatMap((a) => Object.keys(a.estados))),
  ];
  const estadoTot = estados.map((e, i) => ({
    name: e,
    value: sum(d.porArea.map((a) => a.estados[e])),
    color: PALETTE[i],
  }));
  const areaBar = [...d.porArea]
    .sort((a, b) => b.total - a.total)
    .map((a) => ({ area: clip(a.area, 18), total: a.total }));
  const rows: MatRow[] = d.porArea.map((a) => ({
    label: a.area,
    cells: [
      ...estados.map((e) => (a.estados[e] ? fmtArs(a.estados[e]) : "—")),
      <strong key="t">{fmtArs(a.total)}</strong>,
    ],
  }));
  rows.push({
    label: "TOTAL",
    bold: true,
    rowTone: "total",
    cells: [
      ...estados.map((e) => fmtArs(sum(d.porArea.map((a) => a.estados[e])))),
      fmtArs(d.total),
    ],
  });

  return (
    <div>
      <PageTitle
        title="Presupuestos / Órdenes de Compra"
        sub="Importe por área y estado"
      />
      <Grid cols={3}>
        <KPI label="Total OC" value={fmtArs(d.total)} accent="yellow" />
      </Grid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        <Panel title="Estado de órdenes">
          <ChartDonut data={estadoTot} height={280} />
        </Panel>
        <Panel title="Importe por área" accent="($)">
          <ChartBar
            data={areaBar}
            xKey="area"
            horizontal
            height={280}
            series={[{ key: "total", name: "Total", color: PALETTE[0] }]}
          />
        </Panel>
      </div>

      <SectionTitle>📋 Detalle por Área</SectionTitle>
      <MatrixTable firstLabel="Área" head={[...estados, "Total"]} rows={rows} />
    </div>
  );
}

// ─── IMPUESTOS & LABORALES ──────────────────────────────────────────────────────
export function ImpuestosTab({ d }: { d: FinanzaData["impuestos"] }) {
  const totByConc = d.conceptos.map((c) => ({
    c,
    t: sum(c.valores.map((v) => Math.abs(v ?? 0))),
  }));
  const top = [...totByConc]
    .sort((a, b) => b.t - a.t)
    .slice(0, 6)
    .map((x) => x.c);
  const topSet = new Set(top.map((c) => c.concepto));
  const lastIdx = d.meses.length - 1;

  const evo = d.meses.map((m, i) => {
    const row: Record<string, string | number> = { mes: fmtMes(m) };
    top.forEach((c) => (row[c.concepto] = c.valores[i] ?? 0));
    row["Otros"] = sum(
      d.conceptos
        .filter((c) => !topSet.has(c.concepto))
        .map((c) => c.valores[i] ?? 0),
    );
    return row;
  });
  const evoSeries: Serie[] = [
    ...top.map((c, i) => ({
      key: c.concepto,
      name: clip(c.concepto, 16),
      color: PALETTE[i],
      stackId: "a",
    })),
    { key: "Otros", name: "Otros", color: PALETTE[8], stackId: "a" },
  ];
  const comp = top.map((c, i) => ({
    name: clip(c.concepto, 16),
    value: Math.abs(c.valores[lastIdx] ?? 0),
    color: PALETTE[i],
  }));

  const rows: MatRow[] = d.conceptos.map((c) => ({
    label: c.concepto,
    cells: c.valores.map((v) => fmtArs(v)),
  }));
  rows.push({
    label: "TOTAL",
    bold: true,
    rowTone: "total",
    cells: d.total.map((v) => fmtArs(v)),
  });

  return (
    <div>
      <PageTitle
        title="Impuestos & Laborales"
        sub="Proyección de haberes, cargas y planes fiscales"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Estructura de obligaciones" accent="(por mes)">
          <ChartBar data={evo} xKey="mes" height={300} series={evoSeries} />
        </Panel>
        <Panel
          title={`Composición ${lastIdx >= 0 ? fmtMes(d.meses[lastIdx]) : ""}`}
        >
          <ChartDonut data={comp} height={300} fmt={(n) => fmtShort(n)} />
        </Panel>
      </div>
      <SectionTitle>📊 Detalle Proyección</SectionTitle>
      <MatrixTable head={d.meses.map(fmtMes)} rows={rows} />
    </div>
  );
}

// ─── PRÉSTAMOS ─────────────────────────────────────────────────────────────────
export function PrestamosTab({ d }: { d: FinanzaData["prestamos"] }) {
  const today = new Date();
  const saldoActual =
    [...d.cuadro]
      .filter(
        (r) =>
          r.saldo != null && r.vencimiento && new Date(r.vencimiento) <= today,
      )
      .pop()?.saldo ??
    [...d.cuadro].reverse().find((r) => r.saldo != null)?.saldo ??
    null;
  const saldoLine = d.cuadro
    .filter((r) => r.saldo != null)
    .map((r) => ({ vto: fmtDate(r.vencimiento), saldo: r.saldo }));
  const comp = d.cuadro.slice(0, 12).map((r, i) => ({
    n: `#${i + 1}`,
    capital: r.capital ?? 0,
    interes: r.interes ?? 0,
    impuesto: r.impuesto ?? 0,
  }));

  return (
    <div>
      <PageTitle title="Préstamos" sub={d.titulo ?? "Cuadro de amortización"} />
      <Grid cols={3}>
        <KPI label="Monto original" value={fmtArs(d.monto)} accent="yellow" />
        <KPI label="Saldo actual" value={fmtArs(saldoActual)} accent="red" />
        <KPI label="Cuotas" value={fmtNum(d.cuadro.length)} accent="neutral" />
      </Grid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        <Panel title="Evolución del saldo de capital">
          <ChartLine
            data={saldoLine}
            xKey="vto"
            height={280}
            series={[{ key: "saldo", name: "Saldo", color: PALETTE[0] }]}
          />
        </Panel>
        <Panel
          title="Composición de cuota"
          accent="(capital · interés · impuesto)"
        >
          <ChartBar
            data={comp}
            xKey="n"
            height={280}
            series={[
              {
                key: "capital",
                name: "Capital",
                color: PALETTE[1],
                stackId: "a",
              },
              {
                key: "interes",
                name: "Interés",
                color: PALETTE[2],
                stackId: "a",
              },
              {
                key: "impuesto",
                name: "Impuesto",
                color: PALETTE[5],
                stackId: "a",
              },
            ]}
          />
        </Panel>
      </div>

      <SectionTitle>📅 Cuadro de Amortización</SectionTitle>
      <Table<FinanzaData["prestamos"]["cuadro"][number]>
        cols={[
          {
            key: "vencimiento",
            label: "Vto",
            render: (r) => fmtDate(r.vencimiento),
          },
          {
            key: "capital",
            label: "Capital",
            num: true,
            render: (r) => fmtArs(r.capital),
          },
          {
            key: "interes",
            label: "Interés",
            num: true,
            render: (r) => fmtArs(r.interes),
          },
          {
            key: "impuesto",
            label: "Impuesto",
            num: true,
            render: (r) => fmtArs(r.impuesto),
          },
          {
            key: "cuota",
            label: "Cuota",
            num: true,
            render: (r) => fmtArs(r.cuota),
          },
          {
            key: "saldo",
            label: "Saldo",
            num: true,
            render: (r) => fmtArs(r.saldo),
          },
        ]}
        rows={d.cuadro}
        max={120}
        maxH={460}
      />
    </div>
  );
}

// ─── CASH FLOW ───────────────────────────────────────────────────────────────
export function CashTab({ d }: { d: FinanzaData["cash"] }) {
  const finalRow =
    d.filas.find((f) => f.kind === "final" && /\$/.test(f.label)) ??
    d.filas.find((f) => f.kind === "final");
  const finalUsdRow = d.filas.find(
    (f) => f.kind === "final" && /USD/i.test(f.label),
  );
  const ingresoRow = d.filas.find((f) => /COBRANZAS CORRIENTES/i.test(f.label));
  const inicioRow = d.filas.find((f) => f.kind === "inicio");
  const egresosRow = d.filas.find((f) => f.kind === "egresos");
  const saldoBar = d.meses.map((m, i) => ({
    mes: fmtMes(m),
    saldo: finalRow?.values[i] ?? null,
    inicio: inicioRow?.values[i] ?? null,
  }));
  const egrBar = d.meses.map((m, i) => ({
    mes: fmtMes(m),
    egresos: egresosRow ? Math.abs(egresosRow.values[i] ?? 0) : 0,
  }));
  const usdBar = d.meses.map((m, i) => ({
    mes: fmtMes(m),
    usd: finalUsdRow?.values[i] ?? null,
  }));
  const ingEgrBar = d.meses.map((m, i) => ({
    mes: fmtMes(m),
    ingresos: ingresoRow?.values[i] ?? null,
    egresos: egresosRow ? Math.abs(egresosRow.values[i] ?? 0) : 0,
  }));

  const toneOf = (k?: string): MatRow["rowTone"] =>
    k === "inicio"
      ? "pos"
      : k === "egresos"
        ? "neg"
        : k === "final"
          ? "total"
          : k === "comex"
            ? "comex"
            : undefined;
  const rows: MatRow[] = d.filas.map((f) => ({
    label: f.label,
    bold: !!f.kind,
    rowTone: toneOf(f.kind),
    cells: f.values.map((v) => fmtArs(v)),
  }));

  return (
    <div>
      <PageTitle
        title="Cash Mensual"
        sub="Posición de caja proyectada · bloque COMEX · saldo final"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Saldo de caja proyectado" accent="($)">
          <ChartBar
            data={saldoBar}
            xKey="mes"
            height={260}
            series={[
              { key: "inicio", name: "Inicio", color: PALETTE[3] },
              { key: "saldo", name: "Saldo final", color: PALETTE[0] },
            ]}
          />
        </Panel>
        <Panel title="Egresos por mes" accent="($)">
          <ChartBar
            data={egrBar}
            xKey="mes"
            height={260}
            series={[{ key: "egresos", name: "Egresos", color: PALETTE[5] }]}
          />
        </Panel>
      </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <Panel title="Saldo de caja USD final" accent="(USD)">
            <ChartBar
              data={usdBar}
              xKey="mes"
              height={260}
              series={[{ key: "usd", name: "Saldo USD", color: PALETTE[3] }]}
              fmt={(n) => fmtShort(n, "US$")}
              showValues
            />
          </Panel>
          <Panel title="Ingresos vs Egresos" accent="($ por mes)">
            <ChartBar
              data={ingEgrBar}
              xKey="mes"
              height={260}
              series={[
                { key: "ingresos", name: "Ingresos", color: PALETTE[0] },
                { key: "egresos", name: "Egresos", color: PALETTE[5] },
              ]}
            />
          </Panel>
        </div>
      <SectionTitle>📋 Cash Flow Detallado</SectionTitle>
      <MatrixTable head={d.meses.map(fmtMes)} rows={rows} />
    </div>
  );
}

// ─── MACRO & USD ───────────────────────────────────────────────────────────────
export function MacroTab({
  macro,
  onRefresh,
}: {
  macro: MacroData | null;
  onRefresh: () => void;
}) {
  const oficial = macro?.dolares.find((d) => /oficial/i.test(d.nombre));
  const dolarBar = (macro?.dolares ?? []).map((d) => ({
    nombre: d.nombre,
    venta: d.venta ?? 0,
  }));
  const tasaBar = [
    { k: "Infl. mensual", v: macro?.inflacionMensual ?? 0 },
    { k: "Infl. interanual", v: macro?.inflacionInteranual ?? 0 },
    { k: "PF TNA", v: macro?.plazoFijoTNA ?? 0 },
  ];
  const brechaBar = (macro?.dolares ?? [])
    .filter(
      (d) => !/oficial/i.test(d.nombre) && d.venta != null && oficial?.venta,
    )
    .map((d) => ({
      nombre: d.nombre,
      brecha: oficial?.venta
        ? (((d.venta as number) - oficial.venta) / oficial.venta) * 100
        : 0,
    }));
  const tcEvoData = (macro?.tcSerie ?? []).map((x) => ({
    fecha: x.fecha.slice(5),
    venta: x.venta,
  }));
  const inflData = (macro?.inflacionSerie ?? []).map((x) => ({
    fecha: x.fecha.slice(0, 7),
    valor: x.valor,
  }));
  return (
    <div>
      <div className="flex items-start justify-between">
        <PageTitle
          title="Macro & USD"
          sub="Tipo de cambio, inflación y tasas (Argentina)"
        />
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 text-xs text-yellow-400 border border-yellow-400/30 rounded-lg px-3 py-2 hover:bg-yellow-400/5 transition-colors"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {!macro ? (
        <div className="py-16 text-center text-zinc-600 text-sm">
          Sin datos. Tocá «Actualizar».
        </div>
      ) : (
        <>
          <Grid cols={4}>
            {macro.dolares.map((d) => (
              <KPI
                key={d.nombre}
                label={`Dólar ${d.nombre}`}
                value={fmtArs(d.venta)}
                sub={
                  d.compra != null ? `compra ${fmtArs(d.compra)}` : undefined
                }
                accent="yellow"
              />
            ))}
          </Grid>
          <Grid cols={3}>
            <KPI
              label="Inflación mensual"
              value={fmtPct(macro.inflacionMensual)}
              accent="red"
            />
            <KPI
              label="Inflación interanual"
              value={fmtPct(macro.inflacionInteranual)}
              accent="red"
            />
            <KPI
              label="Plazo fijo TNA (prom.)"
              value={fmtPct(macro.plazoFijoTNA)}
              accent="green"
            />
          </Grid>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
            <Panel title="Cotizaciones USD" accent="(venta · $)">
              <ChartBar
                data={dolarBar}
                xKey="nombre"
                height={260}
                series={[{ key: "venta", name: "Venta", color: PALETTE[0] }]}
                fmt={(n) => fmtShort(n)}
                showValues
              />
            </Panel>
            <Panel title="Tasas e inflación" accent="(%)">
              <ChartBar
                data={tasaBar}
                xKey="k"
                height={260}
                series={[{ key: "v", name: "%", color: PALETTE[2] }]}
                fmt={(n) => `${n.toFixed(1)}%`}
                showValues
              />
            </Panel>
          </div>

          {brechaBar.length > 0 && (
            <div className="mt-4">
              <Panel title="Brecha cambiaria — vs Oficial" accent="(%)">
                <ChartBar
                  data={brechaBar}
                  xKey="nombre"
                  height={240}
                  series={[
                    { key: "brecha", name: "Brecha", color: PALETTE[4] },
                  ]}
                  fmt={(n) => `${n.toFixed(1)}%`}
                  showValues
                />
              </Panel>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Panel title="Evolución TC oficial" accent="($)">
              <ChartLine
                data={tcEvoData}
                xKey="fecha"
                height={260}
                series={[{ key: "venta", name: "Venta", color: PALETTE[0] }]}
                fmt={(n) => fmtShort(n)}
              />
            </Panel>
            <Panel title="Inflación mensual" accent="(%)">
              <ChartLine
                data={inflData}
                xKey="fecha"
                height={260}
                series={[
                  { key: "valor", name: "Mensual %", color: PALETTE[5] },
                ]}
                fmt={(n) => `${n.toFixed(1)}%`}
              />
            </Panel>
          </div>

          <SectionTitle>📊 Variables Macroeconómicas</SectionTitle>
          <Table<MacroData["dolares"][number]>
            cols={[
              { key: "nombre", label: "Tipo de cambio" },
              {
                key: "compra",
                label: "Compra",
                num: true,
                render: (r) => fmtArs(r.compra),
              },
              {
                key: "venta",
                label: "Venta",
                num: true,
                render: (r) => fmtArs(r.venta),
              },
              {
                key: "brecha",
                label: "Brecha vs Oficial",
                num: true,
                render: (r) =>
                  oficial?.venta &&
                  r.venta != null &&
                  !/oficial/i.test(r.nombre)
                    ? `${(((r.venta - oficial.venta) / oficial.venta) * 100).toFixed(1)} %`
                    : "—",
              },
            ]}
            rows={macro.dolares}
          />
          <p className="text-xs text-zinc-600 mt-3">
            Actualizado: {fmtDate(macro.fetchedAt)}{" "}
            {new Date(macro.fetchedAt).toLocaleTimeString("es-AR")}
          </p>
        </>
      )}
    </div>
  );
}
