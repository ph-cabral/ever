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
  MatrixTable,
  type Col,
  type MatRow,
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

// La pestaña PRESUPUESTOS (órdenes de compra por área, en vivo) vive en
// ./presupuestos.tsx: tiene estado propio (fetch + selector de meses), a
// diferencia del resto de las tabs de este archivo, que son puras.

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
