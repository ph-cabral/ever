"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";

// ─── Paleta (EVER WEAR · amarillo de marca + semánticos del mockup) ───────────
export const C = {
  surface: "#171717",
  surface2: "#1f1f1f",
  border: "#27272a",
  brand: "#facc15", // yellow-400
  green: "#3fb950",
  red: "#f85149",
  amber: "#e3b341",
  orange: "#f0883e",
  text: "#e6edf3",
  muted: "#8b949e",
} as const;

// Paleta secuencial para series/donas (marca primero)
export const PALETTE = [
  "#facc15",
  "#3fb950",
  "#f0883e",
  "#58a6ff",
  "#bc8cff",
  "#f85149",
  "#e3b341",
  "#56d4dd",
  "#db61a2",
  "#7ee787",
];

// ─── Formatos ────────────────────────────────────────────────────────────────
export const fmtArs = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : "$ " +
      n.toLocaleString("es-AR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });

export const fmtUsd = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : "US$ " +
      n.toLocaleString("es-AR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });

export const fmtNum = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("es-AR", {
        maximumFractionDigits: dec,
        minimumFractionDigits: dec,
      });

export const fmtPct = (n: number | null | undefined, dec = 1) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("es-AR", { maximumFractionDigits: dec }) + " %";

// Abreviado para ejes/labels de gráfico ($1.257M, $219K)
export const fmtShort = (n: number | null | undefined, prefix = "$") => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9)
    return `${prefix}${(n / 1e9).toLocaleString("es-AR", { maximumFractionDigits: 1 })}MM`;
  if (a >= 1e6)
    return `${prefix}${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`;
  if (a >= 1e3)
    return `${prefix}${(n / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 0 })}K`;
  return `${prefix}${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
};

export const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("es-AR");
};

export const fmtMes = (s: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return s;
  const meses = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  return `${meses[+m[2] - 1]} ${m[1]}`;
};

// ─── PageTitle ───────────────────────────────────────────────────────────────
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">
        {title}
      </h2>
      {sub && <p className="text-zinc-500 text-sm mt-1">{sub}</p>}
    </div>
  );
}

// ─── SectionTitle (texto + línea divisoria, como el mockup) ───────────────────
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-7 mb-3">
      <span className="text-[13px] font-semibold text-zinc-100">
        {children}
      </span>
      <span className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

// ─── Panel (card con título opcional + divisor) ───────────────────────────────
export function Panel({
  title,
  accent,
  children,
  className = "",
  bodyClass = "p-4",
}: {
  title?: React.ReactNode;
  accent?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <div
      className={`rounded-lg bg-[#171717] border border-zinc-800 ${className}`}
    >
      {title && (
        <div className="px-4 pt-4 pb-2 mb-1 border-b border-zinc-800 mx-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {title}{" "}
            {accent && (
              <span className="text-yellow-400 normal-case">{accent}</span>
            )}
          </h3>
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

// ─── KPI ─────────────────────────────────────────────────────────────────────
type Accent = "yellow" | "green" | "red" | "amber" | "neutral";
const ACCENT_TEXT: Record<Accent, string> = {
  yellow: "text-yellow-400",
  green: "text-green-400",
  red: "text-red-400",
  amber: "text-amber-400",
  neutral: "text-zinc-100",
};
export function KPI({
  label,
  value,
  sub,
  accent = "yellow",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: Accent;
}) {
  return (
    <div className="rounded-lg bg-[#171717] border border-zinc-800 px-4 py-3.5">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p
        className={`text-[22px] leading-none font-bold mt-1.5 ${ACCENT_TEXT[accent]}`}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-zinc-600 mt-1.5 leading-tight">{sub}</p>
      )}
    </div>
  );
}

// ─── Grid ────────────────────────────────────────────────────────────────────
export function Grid({
  children,
  cols = 3,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 6;
}) {
  const c =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : cols === 6
          ? "sm:grid-cols-3 lg:grid-cols-6"
          : "sm:grid-cols-2 lg:grid-cols-3";
  return <div className={`grid grid-cols-1 ${c} gap-3`}>{children}</div>;
}

// ─── StatBox (cajas de % con tono, ej. buckets de plazo) ──────────────────────
type Tone = "green" | "amber" | "orange" | "red" | "yellow" | "neutral";
const TONE_BG: Record<Tone, string> = {
  green: "bg-green-400/10 border-green-400/30",
  amber: "bg-amber-400/10 border-amber-400/30",
  orange: "bg-orange-400/10 border-orange-400/30",
  red: "bg-red-400/10 border-red-400/30",
  yellow: "bg-yellow-400/10 border-yellow-400/30",
  neutral: "bg-zinc-700/20 border-zinc-700",
};
const TONE_TEXT: Record<Tone, string> = {
  green: "text-green-400",
  amber: "text-amber-400",
  orange: "text-orange-400",
  red: "text-red-400",
  yellow: "text-yellow-400",
  neutral: "text-zinc-300",
};
export function StatBox({
  big,
  label,
  value,
  tone = "neutral",
}: {
  big: string;
  label: string;
  value?: string;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-md border px-2 py-2 text-center ${TONE_BG[tone]}`}>
      <div className={`text-lg font-bold ${TONE_TEXT[tone]}`}>{big}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{label}</div>
      {value && <div className={`text-[11px] ${TONE_TEXT[tone]}`}>{value}</div>}
    </div>
  );
}

// ─── Tag (pill de estado/riesgo) ──────────────────────────────────────────────
const TAG: Record<Tone, string> = {
  green: "bg-green-400/15 text-green-400",
  amber: "bg-amber-400/15 text-amber-400",
  orange: "bg-orange-400/15 text-orange-400",
  red: "bg-red-400/15 text-red-400",
  yellow: "bg-yellow-400/15 text-yellow-400",
  neutral: "bg-zinc-700/40 text-zinc-400",
};
export function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${TAG[tone]}`}
    >
      {children}
    </span>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
export function Progress({
  label,
  pct,
  value,
  tone = "yellow",
  labelMin = 160,
}: {
  label: string;
  pct: number;
  value?: string;
  tone?: Tone;
  labelMin?: number;
}) {
  const bar: Record<Tone, string> = {
    green: "bg-green-400",
    amber: "bg-amber-400",
    orange: "bg-orange-400",
    red: "bg-red-400",
    yellow: "bg-yellow-400",
    neutral: "bg-zinc-500",
  };
  return (
    <div className="flex items-center gap-2 mb-2">
      <div
        className="text-[11px] text-zinc-500 truncate"
        style={{ minWidth: labelMin }}
      >
        {label}
      </div>
      <div className="flex-1 h-1.5 bg-[#1f1f1f] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${bar[tone]}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      {value && (
        <div
          className={`text-[11px] tabular-nums text-right ${TONE_TEXT[tone]}`}
          style={{ minWidth: 80 }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

// ─── Alert ────────────────────────────────────────────────────────────────────
export function Alert({
  tone = "yellow",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const m: Record<Tone, string> = {
    green: "bg-green-400/10 border-green-400/30 text-green-400",
    amber: "bg-amber-400/10 border-amber-400/30 text-amber-400",
    orange: "bg-orange-400/10 border-orange-400/30 text-orange-400",
    red: "bg-red-400/10 border-red-400/30 text-red-400",
    yellow: "bg-yellow-400/10 border-yellow-400/30 text-yellow-300",
    neutral: "bg-zinc-700/20 border-zinc-700 text-zinc-300",
  };
  return (
    <div
      className={`rounded-md border px-3.5 py-2.5 text-[12px] flex items-start gap-2 ${m[tone]}`}
    >
      {children}
    </div>
  );
}

// ─── MatrixTable (matriz concepto × columnas, con 1ª col pegada) ─────────────
// Vive acá y no en tabs.tsx porque la usan tanto las tabs puras como
// ./presupuestos.tsx, que es su propio componente con estado (si la importara
// de tabs.tsx quedaría un ciclo de imports entre los dos archivos).
export type MatRow = {
  label: string;
  cells: React.ReactNode[];
  bold?: boolean;
  rowTone?: "total" | "neg" | "pos" | "comex";
};
export function MatrixTable({
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

// ─── Tabla genérica ───────────────────────────────────────────────────────────
export interface Col<T> {
  key: string;
  label: string;
  num?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}
export function Table<T>({
  cols,
  rows,
  max = 200,
  empty = "Sin datos",
  maxH,
}: {
  cols: Col<T>[];
  rows: T[];
  max?: number;
  empty?: string;
  maxH?: number;
}) {
  const shown = rows.slice(0, max);
  return (
    <div
      className="rounded-lg bg-[#171717] border border-zinc-800 overflow-auto"
      style={maxH ? { maxHeight: maxH } : undefined}
    >
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#1f1f1f]">
            {cols.map((c) => (
              <th
                key={c.key}
                className={`px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap border-b border-zinc-800 ${c.num ? "text-right" : "text-left"}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr
              key={i}
              className="border-b border-zinc-800/60 hover:bg-[#1f1f1f] transition-colors"
            >
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`px-2.5 py-1.5 whitespace-nowrap ${c.num ? "text-right tabular-nums text-zinc-200" : "text-zinc-300"} ${c.className ?? ""}`}
                >
                  {c.render
                    ? c.render(row)
                    : String((row as Record<string, unknown>)[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td
                colSpan={cols.length}
                className="px-4 py-8 text-center text-zinc-600 text-sm"
              >
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > max && (
        <div className="px-3 py-1.5 text-[11px] text-zinc-600 border-t border-zinc-800">
          Mostrando {max} de {rows.length}
        </div>
      )}
    </div>
  );
}

// ─── Charts (recharts, tema oscuro EVER WEAR) ─────────────────────────────────
const AXIS = { fontSize: 11, fill: C.muted };
const tooltipStyle = {
  background: "#0d0d0d",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 12,
  color: C.text,
} as const;

export type Serie = {
  key: string;
  name: string;
  color?: string;
  stackId?: string;
};

export function ChartBar({
  data,
  xKey,
  series,
  height = 220,
  horizontal = false,
  fmt = (n) => fmtShort(n),
  angle,
  showValues = false,
}: {
  data: unknown[];
  xKey: string;
  series: Serie[];
  height?: number;
  horizontal?: boolean;
  fmt?: (n: number) => string;
  angle?: number;
  showValues?: boolean;
}) {
  if (!data.length) return <Empty h={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{
          top: 8,
          right: 12,
          left: horizontal ? 8 : 0,
          bottom: angle ? 48 : 4,
        }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={C.border}
          vertical={!horizontal}
          horizontal={horizontal ? false : true}
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tick={AXIS}
              stroke={C.border}
              tickFormatter={(v) => fmt(Number(v))}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={AXIS}
              stroke={C.border}
              width={140}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tick={AXIS}
              stroke={C.border}
              angle={angle}
              textAnchor={angle ? "end" : "middle"}
              height={angle ? 56 : 24}
              interval={0}
            />
            <YAxis
              tick={AXIS}
              stroke={C.border}
              tickFormatter={(v) => fmt(Number(v))}
              width={52}
            />
          </>
        )}
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "rgba(250,204,21,.06)" }}
          formatter={(v) => fmt(Number(v))}
        />
        {series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
        )}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId={s.stackId}
            fill={s.color ?? PALETTE[i % PALETTE.length]}
            radius={
              s.stackId ? 0 : ([3, 3, 0, 0] as [number, number, number, number])
            }
          >
            {showValues && (
              <LabelList
                dataKey={s.key}
                position={horizontal ? "right" : "top"}
                formatter={(v) => fmt(Number(v))}
                style={{ fontSize: 10, fill: C.muted }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartLine({
  data,
  xKey,
  series,
  height = 220,
  fmt = (n) => fmtShort(n),
}: {
  data: unknown[];
  xKey: string;
  series: Serie[];
  height?: number;
  fmt?: (n: number) => string;
}) {
  if (!data.length) return <Empty h={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
        <XAxis dataKey={xKey} tick={AXIS} stroke={C.border} />
        <YAxis
          tick={AXIS}
          stroke={C.border}
          tickFormatter={(v) => fmt(Number(v))}
          width={52}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => fmt(Number(v))}
        />
        {series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
        )}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color ?? PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ChartDonut({
  data,
  height = 220,
  fmt = (n) => fmtShort(n),
}: {
  data: { name: string; value: number; color?: string }[];
  height?: number;
  fmt?: (n: number) => string;
}) {
  const clean = data.filter((d) => d.value > 0);
  if (!clean.length) return <Empty h={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={clean}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke={C.surface}
        >
          {clean.map((d, i) => (
            <Cell key={i} fill={d.color ?? PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => fmt(Number(v))}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function Empty({ h }: { h: number }) {
  return (
    <div
      className="flex items-center justify-center text-zinc-700 text-xs"
      style={{ height: h }}
    >
      Sin datos para graficar
    </div>
  );
}
