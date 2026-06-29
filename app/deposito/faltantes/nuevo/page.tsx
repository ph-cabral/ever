"use client";
import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  PackageCheck,
  Check,
  X,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// Faltantes (NUEVA fuente) — calculado desde las OT de Picking del WMS.
//   Por cada OT armada: renglones CUMPLIDOS (recolectados) vs FALTANTES (sin
//   recolectar). Se agrupa por OT y se listan solo las OT con algún faltante.
//   Se excluyen los pedidos descartados/anulados (estado de Magnus, en el backend).
//   Datos en vivo vía /api/deposito/faltantes-ot (indicadores-api → WMS).
// ──────────────────────────────────────────────────────────────────────────────

interface OT {
  OTId: number;
  NroMovVenta: number | null;
  Fecha: string | null;
  Operario: string | null;
  Cliente: number | string | null;
  Vendedor: string | null;
  EstadoPedido: string | null;
  ItemsTotal: number;
  ItemsCumplidos: number;
  ItemsFaltantes: number;
}
interface Resumen {
  ot: number;
  itemsTotal: number;
  itemsCumplidos: number;
  itemsFaltantes: number;
  otDescartadas: number;
}

const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0);
const fmtAr = (s: string | null) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export default function FaltantesPage() {
  const [rows, setRows] = useState<OT[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [dia, setDia] = useState(""); // YYYY-MM-DD; "" = último día con armado
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = d ? `?desde=${d}&hasta=${d}` : "";
      const res = await fetch(`/api/deposito/faltantes-ot${qs}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRows((j.rows ?? []) as OT[]);
      setResumen((j.resumen ?? null) as Resumen | null);
      if (!d && j.fecha) setDia(j.fecha as string); // fija el día del último armado
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setRows([]);
      setResumen(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Primera carga: sin día → el backend devuelve el último día con armado.
  useEffect(() => {
    load("");
  }, [load]);

  const setDay = (d: string) => {
    setDia(d);
    load(d);
  };
  const hoy = isoLocal(new Date());
  const ayer = isoLocal(new Date(Date.now() - 864e5));

  const fillRate = useMemo(() => {
    if (!resumen || resumen.itemsTotal <= 0) return null;
    return (resumen.itemsCumplidos / resumen.itemsTotal) * 100;
  }, [resumen]);

  const hay = rows.length > 0;

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {/* avisos flotantes */}
      {(loading || error) && (
        <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2">
          {loading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" />
              Consultando el WMS…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300">
              <AlertTriangle size={16} className="text-red-400" /> {error}
            </div>
          )}
        </div>
      )}

      {/* header */}
      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex flex-wrap items-center justify-between px-4 md:px-8 py-3 gap-4">
        <div className="flex items-center gap-4">
          <span className="font-bold text-yellow-400 text-xl md:text-2xl tracking-wide uppercase">
            EVER WEAR{" "}
            <span className="text-xs md:text-sm tracking-[3px] font-normal">
              S.A.
            </span>
          </span>
          <div className="w-px h-7 bg-yellow-400/30 hidden md:block" />
          <span className="text-zinc-500 text-sm hidden md:inline">
            Faltantes por OT · {fmtAr(dia)}
          </span>
        </div>
        <div className="flex items-center gap-2 md:gap-3 text-sm">
          <input
            type="date"
            value={dia}
            max={hoy}
            onChange={(e) => setDay(e.target.value)}
            className="bg-[#1f1f1f] border border-zinc-700 rounded-md px-2 py-1.5 text-zinc-100 focus:border-yellow-400 outline-none"
          />
          <button
            onClick={() => setDay(hoy)}
            className={`px-2.5 py-1.5 rounded-md border transition-colors ${
              dia === hoy
                ? "bg-yellow-400 border-yellow-400 text-black font-medium"
                : "border-zinc-700 text-zinc-300 hover:border-yellow-400"
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => setDay(ayer)}
            className={`px-2.5 py-1.5 rounded-md border transition-colors ${
              dia === ayer
                ? "bg-yellow-400 border-yellow-400 text-black font-medium"
                : "border-zinc-700 text-zinc-300 hover:border-yellow-400"
            }`}
          >
            Ayer
          </button>
          <button
            onClick={() => load(dia)}
            title="Refrescar"
            disabled={loading}
            className="text-zinc-400 hover:text-yellow-400 transition-colors p-2 disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* resumen */}
      {resumen && (
        <div className="max-w-[1500px] mx-auto px-4 md:px-8 pt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="OT con faltante" value={fmtNum(resumen.ot)} />
          <Stat
            label="Renglones cumplidos"
            value={fmtNum(resumen.itemsCumplidos)}
            tone="green"
          />
          <Stat
            label="Renglones faltantes"
            value={fmtNum(resumen.itemsFaltantes)}
            tone="red"
          />
          <Stat
            label="% cumplido"
            value={fillRate == null ? "—" : `${fillRate.toFixed(1)}%`}
          />
          <Stat
            label="Pedidos descartados"
            value={fmtNum(resumen.otDescartadas)}
            hint="excluidos"
          />
        </div>
      )}

      <main className="max-w-[1500px] mx-auto px-4 md:px-8 py-6">
        {!hay ? (
          <div className="flex flex-col items-center justify-center py-28 gap-3 text-center">
            {loading ? (
              <Loader2 size={40} className="text-yellow-400 animate-spin" />
            ) : (
              <PackageCheck size={44} className="text-zinc-700" />
            )}
            <p className="text-zinc-400 font-medium">
              {loading
                ? "Consultando el WMS…"
                : "No hay OT con faltantes para este día."}
            </p>
          </div>
        ) : (
          <>
            {/* TABLA (desktop) */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-[#1A1A1A] text-zinc-400">
                  <tr className="text-left">
                    <th className="px-3 py-2.5 font-medium">OT</th>
                    <th className="px-3 py-2.5 font-medium">Pedido</th>
                    <th className="px-3 py-2.5 font-medium">Cliente</th>
                    <th className="px-3 py-2.5 font-medium">Vendedor</th>
                    <th className="px-3 py-2.5 font-medium">Operario</th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Cumplidos
                    </th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Faltantes
                    </th>
                    <th className="px-3 py-2.5 font-medium text-right">Total</th>
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.OTId}
                      className="border-t border-zinc-800/70 hover:bg-zinc-900/50"
                    >
                      <td className="px-3 py-2 font-mono text-zinc-300">
                        {r.OTId}
                      </td>
                      <td className="px-3 py-2 font-mono text-zinc-300">
                        {r.NroMovVenta ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        {r.Cliente ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {r.Vendedor || "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {r.Operario || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-400">
                        {fmtNum(r.ItemsCumplidos)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-400">
                        {fmtNum(r.ItemsFaltantes)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                        {fmtNum(r.ItemsTotal)}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {r.EstadoPedido || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* CARDS (celular) */}
            <div className="md:hidden flex flex-col gap-3">
              {rows.map((r) => (
                <div
                  key={r.OTId}
                  className="rounded-xl border border-zinc-800 bg-[#1A1A1A] p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono text-sm text-zinc-300">
                      OT {r.OTId}
                      {r.NroMovVenta ? (
                        <span className="text-zinc-500">
                          {" "}
                          · Ped. {r.NroMovVenta}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      {r.EstadoPedido || ""}
                    </span>
                  </div>
                  <div className="text-zinc-400 text-sm mb-3">
                    {r.Operario || "—"}
                    {r.Cliente ? (
                      <span className="text-zinc-500"> · Cli. {r.Cliente}</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Mini
                      icon={<Check size={14} />}
                      label="Cumpl."
                      value={fmtNum(r.ItemsCumplidos)}
                      tone="green"
                    />
                    <Mini
                      icon={<X size={14} />}
                      label="Falt."
                      value={fmtNum(r.ItemsFaltantes)}
                      tone="red"
                    />
                    <Mini label="Total" value={fmtNum(r.ItemsTotal)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
  hint?: string;
}) {
  const color =
    tone === "green"
      ? "text-green-400"
      : tone === "red"
        ? "text-red-400"
        : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#1A1A1A] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-zinc-600">{hint}</div>}
    </div>
  );
}

function Mini({
  icon,
  label,
  value,
  tone,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "text-green-400"
      : tone === "red"
        ? "text-red-400"
        : "text-zinc-200";
  return (
    <div className="rounded-lg bg-[#111111] border border-zinc-800 py-2">
      <div className="flex items-center justify-center gap-1 text-[11px] uppercase tracking-wide text-zinc-500">
        {icon} {label}
      </div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
