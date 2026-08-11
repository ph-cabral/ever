"use client";
import { useState, useCallback, useMemo } from "react";
import {
  Loader2, AlertTriangle, Search, LineChart, Package, Sigma, Divide,
  ArrowUpToLine, ArrowDownToLine, Warehouse,
} from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";
import KpiCard from "@/app/rrhh/components/KpiCard";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/consumo — consumo mensual de UN artículo (pedido de Pablo
// 2026-08-11): input "Cod Art" + rango por MESES (no días) → cantidad vendida
// por cada mes del rango, total, promedio (total / meses del rango, contando
// los meses en 0), máximo, total/máximo, mínimo > 0, total/mínimo, y stock
// actual por depósito (1/2/3, seleccionables) con total de los depósitos
// elegidos. Fuente: /api/compras/consumo-articulo (proxy → indicadores-api).
// "Vendido" = mismo criterio de pedido válido que /ventas/pedidos-mes
// (Cerrado/Facturado, blacklist de comprobantes).
// ──────────────────────────────────────────────────────────────────────────────

interface MesRow {
  mes: string; // YYYY-MM
  cantidad: number;
}
interface DepRow {
  deposito: number;
  stock: number;
}
interface Resp {
  codigo: string;
  nombre: string | null;
  desde: string;
  hasta: string;
  mesesEnRango: number;
  meses: MesRow[];
  totalVendido: number;
  promedio: number;
  maximo: number;
  totalSobreMaximo: number | null;
  minimo: number | null;
  totalSobreMinimo: number | null;
  stock: { porDeposito: DepRow[]; total: number };
}

const fmtNum = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);

const MESES_LABEL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const fmtMesLabel = (mes: string) => {
  const m = /(\d{4})-(\d{2})/.exec(mes);
  return m ? `${MESES_LABEL[Number(m[2]) - 1]} ${m[1]}` : mes;
};

// Mes actual y N meses atrás en YYYY-MM, hora LOCAL (mismo criterio que
// mesActual() en /compras).
const mesLocal = (retro = 0) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - retro);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function ComprasConsumoPage() {
  const [cod, setCod] = useState("");
  const [desde, setDesde] = useState(() => mesLocal(5)); // últimos 6 meses
  const [hasta, setHasta] = useState(() => mesLocal(0));
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Depósitos tildados para el stock (default: todos)
  const [deps, setDeps] = useState<Set<number>>(() => new Set([1, 2, 3]));

  const load = useCallback(async () => {
    const codigo = cod.trim();
    if (!codigo) {
      setError("Ingresá un código de artículo");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/compras/consumo-articulo?codigo=${encodeURIComponent(codigo)}&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
        { cache: "no-store" },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [cod, desde, hasta]);

  const toggleDep = (d: number) =>
    setDeps((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  const stockSel = useMemo(
    () =>
      (data?.stock.porDeposito ?? [])
        .filter((r) => deps.has(r.deposito))
        .reduce((acc, r) => acc + r.stock, 0),
    [data, deps],
  );

  const sinVentas = !!data && data.totalVendido === 0;

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {(loading || error) && (
        <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2">
          {loading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" /> Consultando la base…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300">
              <AlertTriangle size={16} className="text-red-400" /> {error}
            </div>
          )}
        </div>
      )}

      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex items-center justify-between px-4 md:px-8 h-16 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <InicioButton />
          <span className="font-bold text-yellow-400 text-xl md:text-2xl tracking-wide uppercase whitespace-nowrap">
            EVER WEAR <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="hidden md:block w-px h-7 bg-yellow-400/30" />
          <span className="hidden md:inline text-zinc-500 text-sm">Compras · Consumo por artículo</span>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-yellow-400 font-bold text-xl uppercase tracking-wide flex items-center gap-2">
            <LineChart size={20} /> Consumo por artículo
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Cantidad vendida por mes (pedidos Cerrados/Facturados) de un artículo en el rango de
            meses elegido, con total, promedio mensual, máximo, mínimo &gt; 0 y stock actual por
            depósito.
          </p>
        </div>

        {/* Filtros: Cod Art + rango de meses */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 flex flex-wrap items-end gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cod-art" className="text-xs text-zinc-400 uppercase tracking-wide">
              Cod Art
            </label>
            <input
              id="cod-art"
              type="text"
              value={cod}
              onChange={(e) => setCod(e.target.value)}
              placeholder="Ej: E730020"
              autoFocus
              className="bg-[#1f1f1f] border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 outline-none w-48 focus:border-yellow-400 placeholder:text-zinc-600"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mes-desde" className="text-xs text-zinc-400 uppercase tracking-wide">
              Desde (mes)
            </label>
            <input
              id="mes-desde"
              type="month"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value || mesLocal(5))}
              className="bg-[#1f1f1f] border border-zinc-700 rounded-md px-2 py-2 text-sm text-zinc-200 outline-none [color-scheme:dark] focus:border-yellow-400"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mes-hasta" className="text-xs text-zinc-400 uppercase tracking-wide">
              Hasta (mes)
            </label>
            <input
              id="mes-hasta"
              type="month"
              value={hasta}
              min={desde}
              max={mesLocal(0)}
              onChange={(e) => setHasta(e.target.value || mesLocal(0))}
              className="bg-[#1f1f1f] border border-zinc-700 rounded-md px-2 py-2 text-sm text-zinc-200 outline-none [color-scheme:dark] focus:border-yellow-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-anim flex items-center gap-2 bg-yellow-400 text-black font-semibold text-sm rounded-md px-4 py-2 disabled:opacity-40"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Buscar
          </button>
          {data && (
            <span className="text-sm text-zinc-500 pb-2">
              {data.codigo}
              {data.nombre ? ` — ${data.nombre}` : ""}
            </span>
          )}
        </form>

        {!data && !loading && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
            <Search size={40} className="text-zinc-700" />
            <p className="text-zinc-500 text-sm">
              Ingresá un código de artículo y un rango de meses para ver su consumo.
            </p>
          </div>
        )}

        {data && (
          <>
            {sinVentas && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
                <AlertTriangle size={13} />
                Sin ventas registradas para {data.codigo} en {fmtMesLabel(data.desde)} –{" "}
                {fmtMesLabel(data.hasta)}
                {data.nombre === null ? " — verificá que el código exista" : ""}
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                label="Total vendido"
                value={fmtNum(data.totalVendido)}
                hint={`Suma de ${data.mesesEnRango} mes(es) del rango`}
                icon={Sigma}
                accent="yellow"
              />
              <KpiCard
                label="Promedio mensual"
                value={fmtNum(data.promedio)}
                hint={`Total vendido / ${data.mesesEnRango} mes(es) del rango`}
                icon={Divide}
                accent="blue"
              />
              <KpiCard
                label="Stock seleccionado"
                value={fmtNum(stockSel)}
                hint={
                  deps.size === 3
                    ? "Todos los depósitos"
                    : deps.size === 0
                      ? "Sin depósitos tildados"
                      : `Depósito(s) ${[...deps].sort().join(", ")}`
                }
                icon={Warehouse}
                accent="green"
              />
              <KpiCard
                label="Máximo mensual"
                value={fmtNum(data.maximo)}
                hint={`Total/máximo: ${fmtNum(data.totalSobreMaximo)}`}
                icon={ArrowUpToLine}
                accent="orange"
              />
              <KpiCard
                label="Mínimo mensual > 0"
                value={fmtNum(data.minimo)}
                hint={`Total/mínimo: ${fmtNum(data.totalSobreMinimo)}`}
                icon={ArrowDownToLine}
                accent="zinc"
              />
              <KpiCard
                label="Stock total (1+2+3)"
                value={fmtNum(data.stock.total)}
                hint="Suma de los 3 depósitos, tildados o no"
                icon={Package}
                accent="zinc"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Vendido por mes */}
              <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
                <h2 className="text-yellow-400 font-bold text-lg uppercase tracking-wide mb-3">
                  Vendido por mes
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs uppercase tracking-wide border-b border-zinc-800">
                      <th className="text-left py-2 pr-4 font-medium">Mes</th>
                      <th className="text-right py-2 font-medium">Cantidad vendida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.meses.map((r) => {
                      const esMax = data.maximo > 0 && r.cantidad === data.maximo;
                      const esMin = data.minimo !== null && r.cantidad === data.minimo;
                      return (
                        <tr key={r.mes} className="border-b border-zinc-800/60 last:border-0">
                          <td className="py-2 pr-4 text-zinc-300">{fmtMesLabel(r.mes)}</td>
                          <td
                            className={`py-2 text-right tabular-nums ${
                              esMax
                                ? "text-orange-400 font-semibold"
                                : esMin
                                  ? "text-blue-400 font-semibold"
                                  : r.cantidad === 0
                                    ? "text-zinc-600"
                                    : "text-zinc-100"
                            }`}
                          >
                            {fmtNum(r.cantidad)}
                            {esMax && <span className="ml-2 text-[10px] uppercase">máx</span>}
                            {esMin && !esMax && (
                              <span className="ml-2 text-[10px] uppercase">mín</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-700">
                      <td className="py-2 pr-4 text-zinc-300 font-semibold uppercase text-xs tracking-wide">
                        Total
                      </td>
                      <td className="py-2 text-right tabular-nums text-yellow-400 font-bold">
                        {fmtNum(data.totalVendido)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Stock por depósito */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
                <h2 className="text-yellow-400 font-bold text-lg uppercase tracking-wide mb-1">
                  Stock por depósito
                </h2>
                <p className="text-zinc-500 text-xs mb-3">
                  Tildá los depósitos a incluir — el total de abajo suma solo los tildados.
                </p>
                <div className="space-y-2">
                  {data.stock.porDeposito.map((r) => (
                    <label
                      key={r.deposito}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                        deps.has(r.deposito)
                          ? "border-yellow-400/40 bg-yellow-400/5"
                          : "border-zinc-800 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 text-sm text-zinc-300">
                        <input
                          type="checkbox"
                          checked={deps.has(r.deposito)}
                          onChange={() => toggleDep(r.deposito)}
                          className="accent-yellow-400"
                        />
                        Depósito {r.deposito}
                      </span>
                      <span className="tabular-nums text-zinc-100">{fmtNum(r.stock)}</span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-zinc-700 mt-3 pt-3">
                  <span className="text-xs uppercase tracking-wide text-zinc-400 font-semibold">
                    Total seleccionado
                  </span>
                  <span className="tabular-nums text-yellow-400 font-bold">{fmtNum(stockSel)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
