"use client";

import React from "react";

// ─── Formatos ──────────────────────────────────────────────────────────────
export const fmtArs = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : "$ " + n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const fmtUsd = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : "US$ " + n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const fmtNum = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: dec, minimumFractionDigits: dec });

export const fmtPct = (n: number | null | undefined, dec = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: dec }) + " %";

export const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("es-AR");
};

export const fmtMes = (s: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return s;
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${meses[+m[2] - 1]} ${m[1]}`;
};

// ─── Componentes ─────────────────────────────────────────────────────────────
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">{title}</h2>
      {sub && <p className="text-zinc-500 text-sm mt-1">{sub}</p>}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-[#171717] border border-zinc-800 overflow-hidden ${className}`}>
      {title && (
        <div className="px-5 py-3 border-b border-zinc-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function KPI({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "yellow" | "green" | "red" }) {
  const color = accent === "green" ? "text-green-400" : accent === "red" ? "text-red-400" : "text-yellow-400";
  return (
    <div className="rounded-xl bg-[#171717] border border-zinc-800 p-5">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-1">{sub}</p>}
    </div>
  );
}

export function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: number }) {
  const c = cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";
  return <div className={`grid grid-cols-1 ${c} gap-4`}>{children}</div>;
}

export interface Col<T> { key: string; label: string; num?: boolean; render?: (row: T) => React.ReactNode; className?: string }

export function Table<T>({ cols, rows, max = 200, empty = "Sin datos" }: { cols: Col<T>[]; rows: T[]; max?: number; empty?: string }) {
  const shown = rows.slice(0, max);
  return (
    <div className="rounded-xl bg-[#171717] border border-zinc-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1f1f1f]">
            {cols.map((c) => (
              <th key={c.key} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap border-b border-zinc-800 ${c.num ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors">
              {cols.map((c) => (
                <td key={c.key} className={`px-4 py-2.5 whitespace-nowrap ${c.num ? "text-right tabular-nums text-zinc-200" : "text-zinc-300"} ${c.className ?? ""}`}>
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
          {shown.length === 0 && (
            <tr><td colSpan={cols.length} className="px-4 py-8 text-center text-zinc-600 text-sm">{empty}</td></tr>
          )}
        </tbody>
      </table>
      {rows.length > max && <div className="px-4 py-2 text-xs text-zinc-600 border-t border-zinc-800">Mostrando {max} de {rows.length}</div>}
    </div>
  );
}
