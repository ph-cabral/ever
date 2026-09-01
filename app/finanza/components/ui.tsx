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
          vertical={horizontal}
          horizontal={!horizontal}
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

// ─── BarrasH — ranking horizontal en HTML/CSS (sin recharts) ─────────────────
// Una barra por fila con su etiqueta al lado: no hace falta leyenda para saber
// qué es cada barra (que es justo lo que no se entiende cuando hay una serie
// por estado). No mide el contenedor ni depende de ResponsiveContainer, así
// que no puede quedar en blanco por montarse antes de que el panel tenga
// ancho. La escala se redondea a un número "lindo" (1 · 1,5 · 2 · 2,5 · 3 · 4 ·
// 5 · 7,5 × 10ⁿ) para que las marcas del eje caigan en valores legibles.
export type BarraH = {
  label: string;
  value: number;
  color: string;
  hint?: string;
};

const escalaLinda = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / e;
  return (([1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((x) => f <= x) ?? 10) * e);
};

// Una sola unidad para TODO el gráfico (la del valor más grande): si cada
// número elige la suya sale un eje ilegible mezclando $375M con $1,1MM.
const fmtUnidad = (tope: number) => {
  const [div, suf]: [number, string] =
    tope >= 1e6 ? [1e6, "M"] : tope >= 1e3 ? [1e3, "K"] : [1, ""];
  return (n: number) => {
    const v = n / div;
    return `$${v.toLocaleString("es-AR", {
      maximumFractionDigits: v !== 0 && Math.abs(v) < 10 ? 1 : 0,
    })}${suf}`;
  };
};

export function BarrasH({
  data,
  fmt,
  labelWidth = 150,
  valueWidth = 62,
  barH = 13,
  marcas = 4,
}: {
  data: BarraH[];
  fmt?: (n: number) => string;
  labelWidth?: number;
  valueWidth?: number;
  barH?: number;
  marcas?: number;
}) {
  if (!data.length) return <Empty h={160} />;
  const tope = escalaLinda(Math.max(...data.map((b) => b.value)));
  const f = fmt ?? fmtUnidad(tope);
  const ticks = Array.from({ length: marcas + 1 }, (_, i) => (tope * i) / marcas);
  return (
    <div className="text-[10px]">
      <div className="relative">
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{ left: labelWidth, right: valueWidth }}
        >
          {ticks.map((_, i) => (
            <span
              key={i}
              className="absolute inset-y-0 border-l border-zinc-800"
              style={{ left: `${(i / marcas) * 100}%` }}
            />
          ))}
        </div>
        {data.map((b, i) => {
          const pct = Math.max(Math.min((b.value / tope) * 100, 100), 0.4);
          return (
            <div
              key={`${b.label}-${i}`}
              className="relative flex items-center"
              style={{ height: barH + 6 }}
              title={b.hint ?? `${b.label}: ${f(b.value)}`}
            >
              <span
                className="shrink-0 truncate pr-2 text-right text-zinc-400"
                style={{ width: labelWidth }}
              >
                {b.label}
              </span>
              <span
                className="relative flex-1"
                style={{ height: barH, marginRight: valueWidth }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-[2px]"
                  style={{ width: `${pct}%`, background: b.color }}
                />
              </span>
              <span
                className="absolute right-0 text-right tabular-nums text-zinc-500"
                style={{ width: valueWidth - 6 }}
              >
                {f(b.value)}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className="relative mt-1.5 h-4"
        style={{ marginLeft: labelWidth, marginRight: valueWidth }}
      >
        {ticks.map((t, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 whitespace-nowrap text-zinc-600"
            style={{ left: `${(i / marcas) * 100}%` }}
          >
            {f(t)}
          </span>
        ))}
      </div>
    </div>
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
