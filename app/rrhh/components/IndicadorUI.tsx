"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

// Selector de mes (input nativo type="month") con spinner de carga.
export function MesSelect({
  ym,
  setYm,
  loading,
}: {
  ym: string;
  setYm: (v: string) => void;
  loading: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400 shrink-0">
      Mes:
      <input
        type="month"
        value={ym}
        onChange={(e) => setYm(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-100 outline-none focus:border-yellow-400 cursor-pointer"
      />
      {loading && <Loader2 size={15} className="animate-spin text-yellow-400" />}
    </label>
  );
}

// Encabezado de pestaña: título + subtítulo + selector de mes.
export function TabHeader({
  title,
  sub,
  ym,
  setYm,
  loading,
}: {
  title: string;
  sub?: string;
  ym: string;
  setYm: (v: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">{title}</h2>
        {sub && <p className="text-zinc-500 text-sm mt-1">{sub}</p>}
      </div>
      <MesSelect ym={ym} setYm={setYm} loading={loading} />
    </div>
  );
}

// Tarjeta contenedora para los gráficos (los ChartCard no traen fondo propio).
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">{children}</div>
  );
}

export function ErrMsg({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-3 text-sm text-red-300">
      {msg}
    </div>
  );
}

export function Empty({ msg = "Sin datos para el período." }: { msg?: string }) {
  return <div className="py-12 text-center text-zinc-600 text-sm">{msg}</div>;
}
