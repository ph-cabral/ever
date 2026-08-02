"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Últimos `cant` meses (más reciente primero), asegurando que `incluir`
// (el mes actualmente seleccionado) siempre esté en la lista aunque caiga
// fuera del rango.
function ultimosMeses(cant: number, incluir?: string): string[] {
  const set = new Set<string>();
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < cant; i++) {
    set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  if (incluir) set.add(incluir);
  return Array.from(set).sort().reverse();
}

const nombreMes = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
};

// Selector de mes con spinner de carga. Antes era un <input type="month">
// nativo: al clickear en el medio del control (en vez del pequeño ícono de
// calendario del borde) no desplegaba nada, lo que parecía roto (reportado
// por Pablo 2026-08-01). Un <select> real siempre abre el desplegable del
// navegador con cualquier click.
export function MesSelect({
  ym,
  setYm,
  loading,
}: {
  ym: string;
  setYm: (v: string) => void;
  loading: boolean;
}) {
  const opciones = ultimosMeses(24, ym);
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400 shrink-0">
      Mes:
      <select
        value={ym}
        onChange={(e) => setYm(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-100 outline-none focus:border-yellow-400 cursor-pointer"
      >
        {opciones.map((m) => (
          <option key={m} value={m}>
            {nombreMes(m)}
          </option>
        ))}
      </select>
      {loading && (
        <Loader2 size={15} className="animate-spin text-yellow-400" />
      )}
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
        <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">
          {title}
        </h2>
        {sub && <p className="text-zinc-500 text-sm mt-1">{sub}</p>}
      </div>
      <MesSelect ym={ym} setYm={setYm} loading={loading} />
    </div>
  );
}

// Tarjeta contenedora para los gráficos (los ChartCard no traen fondo propio).
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      {children}
    </div>
  );
}

export function ErrMsg({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-3 text-sm text-red-300">
      {msg}
    </div>
  );
}

export function Empty({
  msg = "Sin datos para el período.",
}: {
  msg?: string;
}) {
  return <div className="py-12 text-center text-zinc-600 text-sm">{msg}</div>;
}
