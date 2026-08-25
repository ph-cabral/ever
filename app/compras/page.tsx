"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, PackageX, ShoppingCart, PackageCheck, BarChart3,
  Package, Wallet, Percent,
} from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";
import KpiCard from "@/app/rrhh/components/KpiCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import PieChartCard from "@/app/rrhh/components/charts/PieChartCard";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/metricas — funnel mensual en ITEMS (artículos distintos, no
// unidades): Faltantes detectados en el mes → de esos, cuántos tuvieron una
// Orden de Compra ese mismo mes → de esos, cuántos ya ingresaron a la empresa
// ese mismo mes. Fuente: /api/compras/metricas (ver comentario ahí para el
// detalle de cada columna). Selector de mes, default = mes actual.
// ──────────────────────────────────────────────────────────────────────────────

interface Columna {
  key: string;
  label: string;
  total: number;
  articulos: string[];
}
interface Grupo {
  key: string;
  label: string;
  total: number;
}
interface Resp {
  mes: string;
  desde: string;
  hasta: string;
  ocWarn: boolean;
  ingresoWarn: boolean;
  clasifWarn: boolean;
  pedidosMesWarn: boolean;
  faltantesUnidades: number;
  faltantesImporte: number;
  pedidosMesUnidades: number;
  pedidosMesImporte: number;
  pctUnidades: number | null;
  pctImporte: number | null;
  columnas: Columna[];
  torta: Grupo[];
}

// /compras/compras-valorizado — mismo mes que el selector de arriba:
// unidades e $ de las OC hechas ese mes, valorizado a precio de VENTA (no al
// costo de la OC). Pedido de Pablo 2026-08-04.
interface RangoResp {
  desde: string;
  hasta: string;
  itemsDistintos: number;
  unidadesCompradas: number;
  montoVenta: number;
  articulosSinPrecio: number;
}

// Paleta del funnel (barras) — Faltantes/Con OC/Ingresados: mismos matices que
// ya usan las KpiCard de arriba (orange/blue/green), para que barra y card
// queden asociadas visualmente. Antes todas las barras salían del mismo
// amarillo (t.primary), sin distinguirse entre sí.
const FUNNEL_COLORS = ["#FB923C", "#60A5FA", "#4ADE80"];
// Paleta de la torta (origen) — antes t.palette son 8 tonos de amarillo/ámbar
// casi indistinguibles entre sí para solo 3 categorías. Importados/Nacionales
// en los mismos tonos que el funnel (blue/green) + violeta para Fábrica
// (categoría "aparte", no es ni importado ni nacional).
const ORIGEN_COLORS = ["#60A5FA", "#4ADE80", "#C084FC"];

const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0);
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n || 0);
const fmtPct = (n: number | null) => (n === null ? "—" : `${fmtNum(n)}%`);

const fmtMesLabel = (mes: string) => {
  const m = /(\d{4})-(\d{2})/.exec(mes);
  if (!m) return mes;
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return `${meses[Number(m[2]) - 1]} ${m[1]}`;
};

// Mes actual en formato YYYY-MM, hora LOCAL (no UTC) — mismo criterio que
// todayISO() en /compras/faltantes, para que coincida con el día calendario
// del usuario.
const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function ComprasMetricasPage() {
  const [mes, setMes] = useState(mesActual);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compras/metricas?mes=${encodeURIComponent(mes)}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => {
    load();
  }, [load]);

  // Vinculado al mismo mes del selector de arriba (data.desde/data.hasta ya
  // son el 1er/último día de ese mes, calculados por /api/compras/metricas):
  // unidades/$ de OC hechas ese mes, valorizado a precio de venta. Se
  // actualiza solo cuando cambia el mes — sin selector ni botón propios.
  const [rangoData, setRangoData] = useState<RangoResp | null>(null);
  const [rangoLoading, setRangoLoading] = useState(false);
  const [rangoError, setRangoError] = useState<string | null>(null);

  const loadRango = useCallback(async (desde: string, hasta: string) => {
    setRangoLoading(true);
    setRangoError(null);
    try {
      const res = await fetch(
        `/api/compras/compras-valorizado?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
        { cache: "no-store" },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRangoData(j);
    } catch (e) {
      setRangoError(e instanceof Error ? e.message : "Error al cargar");
      setRangoData(null);
    } finally {
      setRangoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (data?.desde && data?.hasta) {
      loadRango(data.desde, data.hasta);
    }
  }, [data?.desde, data?.hasta, loadRango]);

  const chartData = useMemo(
    () => (data?.columnas ?? []).map((c) => ({ name: c.label, value: c.total })),
    [data],
  );

  const pieData = useMemo(
    () => (data?.torta ?? []).filter((g) => g.total > 0).map((g) => ({ name: g.label, value: g.total })),
    [data],
  );

  const col = useCallback(
    (key: string) => data?.columnas.find((c) => c.key === key)?.total ?? 0,
    [data],
  );

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
          <span className="hidden md:inline text-zinc-500 text-sm">
            Métricas de compras · {fmtMesLabel(mes)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={mes}
            max={mesActual()}
            onChange={(e) => setMes(e.target.value || mesActual())}
            className="bg-[#1f1f1f] border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 outline-none [color-scheme:dark] focus:border-yellow-400"
          />
          <button
            onClick={load}
            title="Refrescar"
            disabled={loading}
            className="btn-anim text-zinc-400 hover:text-yellow-400 p-2 disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <UsuarioActual />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-yellow-400 font-bold text-xl uppercase tracking-wide flex items-center gap-2">
            <BarChart3 size={20} /> Faltantes, OC e ingresos
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Cantidad de artículos distintos (items, no unidades) — de los faltantes detectados en{" "}
            {fmtMesLabel(mes)}, cuántos tuvieron una Orden de Compra ese mismo mes y, de esos, cuántos ya
            ingresaron a la empresa. La torta clasifica esos mismos faltantes por origen: Importados,
            Nacionales o EVER WEAR INDUSTRIAL (proveedor propio, se excluye de los otros dos grupos).
          </p>
        </div>

        {(data?.ocWarn || data?.ingresoWarn) && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
            <AlertTriangle size={13} />
            {data?.ocWarn && data?.ingresoWarn
              ? "OC e ingresos no disponibles — columnas 2 y 3 pueden estar incompletas"
              : data?.ocWarn
                ? "OC no disponible — columna “Con OC” puede estar incompleta"
                : "Ingresos no disponible — columna “Ingresados” puede estar incompleta"}
          </div>
        )}
        {data?.clasifWarn && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
            <AlertTriangle size={13} />
            No se pudo clasificar proveedor/importación para algunos artículos — la torta puede estar incompleta
          </div>
        )}
        {data?.pedidosMesWarn && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
            <AlertTriangle size={13} />
            Total pedido del mes no disponible — el % sobre el total no se puede calcular
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Faltantes del mes"
            value={col("faltantes")}
            hint="Artículos marcados sin existencia"
            icon={PackageX}
            accent="orange"
          />
          <KpiCard
            label="Con OC ese mes"
            value={col("conOC")}
            hint="De los faltantes, con Orden de Compra"
            icon={ShoppingCart}
            accent="blue"
          />
          <KpiCard
            label="Ingresados ese mes"
            value={col("ingresados")}
            hint="De esos, ya recibidos en depósito"
            icon={PackageCheck}
            accent="green"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Unidades faltantes"
            value={fmtNum(data?.faltantesUnidades ?? 0)}
            hint="Total de unidades de los artículos faltantes del mes"
            icon={Package}
            accent="zinc"
          />
          <KpiCard
            label="$ faltantes"
            value={fmtMoney(data?.faltantesImporte ?? 0)}
            hint="Total en $ de los artículos faltantes del mes"
            icon={Wallet}
            accent="yellow"
          />
          <KpiCard
            label="% del total pedido"
            value={fmtPct(data?.pctImporte ?? null)}
            hint={
              data?.pctUnidades != null
                ? `En $ · en unidades: ${fmtPct(data.pctUnidades)}`
                : "Faltantes ($) sobre el total pedido/vendido ese mes"
            }
            icon={Percent}
            accent="orange"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
            {chartData.length > 0 ? (
              <BarChartCard
                title={`Items por etapa — ${fmtMesLabel(mes)}`}
                data={chartData}
                xKey="name"
                yKey="value"
                currency={false}
                height={340}
                xAngle={0}
                colors={FUNNEL_COLORS}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                {loading ? (
                  <Loader2 size={36} className="text-yellow-400 animate-spin" />
                ) : (
                  <PackageCheck size={40} className="text-zinc-700" />
                )}
                <p className="text-zinc-500 text-sm">
                  {loading ? "Consultando la base…" : "Sin datos para este mes."}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
            {pieData.length > 0 ? (
              <PieChartCard
                title={`Faltantes por origen — ${fmtMesLabel(mes)}`}
                data={pieData}
                height={340}
                colors={ORIGEN_COLORS}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                {loading ? (
                  <Loader2 size={36} className="text-yellow-400 animate-spin" />
                ) : (
                  <PackageCheck size={40} className="text-zinc-700" />
                )}
                <p className="text-zinc-500 text-sm">
                  {loading ? "Consultando la base…" : "Sin datos para este mes."}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 space-y-4">
          <div>
            <h2 className="text-yellow-400 font-bold text-lg uppercase tracking-wide flex items-center gap-2">
              <ShoppingCart size={18} /> Compras del mes (a precio de venta)
              {rangoLoading && <Loader2 size={15} className="animate-spin text-yellow-400" />}
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              Unidades de Órdenes de Compra generadas en {fmtMesLabel(mes)} (haya llegado o no
              todavía) y su valor estimado a precio de VENTA — no al costo de la OC. Mismo mes elegido
              arriba.
            </p>
          </div>

          {rangoError && (
            <div className="flex items-center gap-1.5 text-xs text-red-300">
              <AlertTriangle size={13} /> {rangoError}
            </div>
          )}
          {!!rangoData?.articulosSinPrecio && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
              <AlertTriangle size={13} />
              {rangoData.articulosSinPrecio} artículo(s) sin precio de venta encontrado — valorizados en $0
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Items distintos comprados"
              value={fmtNum(rangoData?.itemsDistintos ?? 0)}
              hint="Artículos distintos con OC ese mes"
              icon={ShoppingCart}
              accent="blue"
            />
            <KpiCard
              label="Unidades compradas"
              value={fmtNum(rangoData?.unidadesCompradas ?? 0)}
              hint="Total de unidades pedidas por OC ese mes"
              icon={Package}
              accent="zinc"
            />
            <KpiCard
              label="$ a precio de venta"
              value={fmtMoney(rangoData?.montoVenta ?? 0)}
              hint="Valorizado a precio de venta, no al costo de la OC"
              icon={Wallet}
              accent="yellow"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
