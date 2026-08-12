"use client";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Loader2, AlertTriangle, Search, LineChart, Package, Sigma, Divide,
  ArrowUpToLine, ArrowDownToLine, Warehouse, Table2,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
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
//
// Vista "Tabla": TODOS los artículos que matchean el filtro (código y/o
// línea) en el rango de meses elegido, una fila por artículo, paginada de a
// 20 y ordenable por Código/Stock/Vendido/Promedio/Máximo/Mínimo (clic en el
// encabezado). Fuente: /api/compras/consumo-articulos (plural).
//
// Rediseño 2026-08-12 (pedido de Pablo, mismo día que lo de arriba):
//   · La tabla es ahora la vista principal (ya no hay toggle Individual/Tabla).
//   · Filtro por Código y filtro por Línea (StkFer_ArtParamet.Nivel1) se
//     combinan por AND, pero NINGUNO es obligatorio por separado — con la
//     salvedad de que hace falta AL MENOS UNO de los dos antes de cargar
//     nada (evita agregar el catálogo completo, ver NOTA en
//     fetch_consumo_articulos, indicadores-api/compras.py).
//   · El input de línea tiene un datalist con la cantidad de artículos por
//     línea (fuente: /api/compras/lineas) — así se ve en la propia vista
//     cuánto pesa cada línea, sin adivinar de antemano si conviene dropdown
//     o texto libre.
//   · La vista "individual" (detalle mensual + stock por depósito de UN
//     artículo) ya no tiene su propio formulario de código: se abre haciendo
//     clic en una fila de la tabla, con botón "Volver a la tabla".
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

// ── Vista "Tabla" (todos los artículos del rango) ───────────────────────────
type Vista = "individual" | "tabla";
interface ArticuloRow {
  codigo: string;
  nombre: string | null;
  totalVendido: number;
  promedio: number;
  maximo: number;
  minimo: number | null;
  stock: number;
}
interface RespTabla {
  desde: string;
  hasta: string;
  mesesEnRango: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  articulos: ArticuloRow[];
}
type SortKey = "codigo" | "stock" | "totalVendido" | "promedio" | "maximo" | "minimo";
const PAGE_SIZE = 20;

// Encabezado de columna ordenable (clic alterna asc/desc; cambiar de columna
// arranca en desc). Mismo patrón visual que el resto de la vista (amarillo =
// activo).
function ThSort({
  label,
  sortKey,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={`px-3 py-2 font-medium whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-yellow-400 transition-colors ${
          isActive ? "text-yellow-400" : "text-zinc-400"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        {isActive ? (
          dir === "asc" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <ArrowUpDown size={12} className="opacity-40" />
        )}
      </button>
    </th>
  );
}

export default function ComprasConsumoPage() {
  const [cod, setCod] = useState("");
  const [desde, setDesde] = useState(() => mesLocal(5)); // últimos 6 meses
  const [hasta, setHasta] = useState(() => mesLocal(0));
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Depósitos tildados para el stock (default: todos)
  const [deps, setDeps] = useState<Set<number>>(() => new Set([1, 2, 3]));

  // Vista: "tabla" (todos los artículos que matchean el filtro, paginados de
  // a 20 y ordenables — vista principal) o "individual" (detalle de UN
  // artículo, se abre haciendo clic en una fila de la tabla). La tabla se
  // ordena/pagina/filtra EN EL SERVIDOR (2026-08-12: traer el catálogo
  // completo al navegador y paginar ahí tiró abajo el proceso de
  // indicadores-api con un catálogo grande) — cada cambio de página, orden o
  // búsqueda dispara un fetch nuevo con esos parámetros.
  const [vista, setVista] = useState<Vista>("tabla");
  const [tablaData, setTablaData] = useState<RespTabla | null>(null);
  const [tablaLoading, setTablaLoading] = useState(false);
  const [tablaError, setTablaError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("totalVendido");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [filtroCod, setFiltroCod] = useState(""); // código: lo tipeado, todavía no aplicado
  const [filtroLinea, setFiltroLinea] = useState(""); // línea: lo tipeado, todavía no aplicado
  // Lo efectivamente usado en la última consulta — solo cambia al presionar
  // "Refrescar" (ver handleRefrescar). Escribir en los inputs de arriba NO
  // dispara nada por sí solo (pedido de Pablo 2026-08-12).
  const [appliedCod, setAppliedCod] = useState("");
  const [appliedLinea, setAppliedLinea] = useState("");
  const [refreshTick, setRefreshTick] = useState(0); // fuerza refetch aunque el filtro no cambie

  // Líneas del catálogo (Nivel1) con cantidad de artículos — alimenta el
  // datalist del input "Buscar línea" (pedido de Pablo 2026-08-12: saber
  // cuántos artículos hay por línea para decidir cómo dejar el filtro). Se
  // trae una sola vez al entrar a la página, es liviano (agregado sobre el
  // catálogo, no sobre ventas).
  const [lineas, setLineas] = useState<{ linea: string; cantidadArticulos: number }[]>([]);
  useEffect(() => {
    fetch("/api/compras/lineas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setLineas(Array.isArray(j?.lineas) ? j.lineas : []))
      .catch(() => setLineas([]));
  }, []);

  // Código y línea se combinan (AND), pero ninguno es obligatorio por
  // separado — hace falta AL MENOS UNO APLICADO antes de cargar nada. Mira
  // appliedCod/appliedLinea (lo tipeado no cuenta) — así cambiar el
  // rango/orden/página con un filtro ya aplicado sigue refrescando solo,
  // pero tipear código/línea nunca dispara nada por sí mismo.
  const tieneFiltro = !!(appliedCod || appliedLinea);
  const tieneEntrada = !!(filtroCod.trim() || filtroLinea.trim()); // habilita el botón Refrescar

  const loadTabla = useCallback(async () => {
    if (!tieneFiltro) {
      setTablaData(null);
      setTablaError(null);
      return;
    }
    setTablaLoading(true);
    setTablaError(null);
    try {
      const params = new URLSearchParams({
        desde,
        hasta,
        sort: sortKey,
        sortDir,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (appliedCod) params.set("q", appliedCod);
      if (appliedLinea) params.set("linea", appliedLinea);
      const res = await fetch(`/api/compras/consumo-articulos?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setTablaData(j);
    } catch (e) {
      setTablaError(e instanceof Error ? e.message : "Error al cargar");
      setTablaData(null);
    } finally {
      setTablaLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshTick solo fuerza el refetch, no participa del fetch en sí
  }, [desde, hasta, sortKey, sortDir, page, appliedCod, appliedLinea, tieneFiltro, refreshTick]);

  // Carga automática cada vez que cambia el rango/orden/página, o cuando se
  // aplica un filtro nuevo (Refrescar) — mientras se esté en la vista
  // "tabla". loadTabla ya no hace nada si no hay filtro APLICADO (ver
  // tieneFiltro arriba), así que tipear solo no alcanza para disparar nada.
  useEffect(() => {
    if (vista === "tabla") loadTabla();
  }, [vista, loadTabla]);

  // Único disparador de una búsqueda nueva por texto (pedido de Pablo
  // 2026-08-12): aplica lo tipeado en código/línea y fuerza el refetch
  // (refreshTick) — así "Refrescar" siempre trae datos frescos, incluso
  // repitiendo el mismo filtro.
  const handleRefrescar = useCallback(() => {
    setAppliedCod(filtroCod.trim());
    setAppliedLinea(filtroLinea.trim());
    setPage(1);
    setRefreshTick((t) => t + 1);
  }, [filtroCod, filtroLinea]);

  // Abre el detalle de un artículo (clic en una fila de la tabla).
  const abrirDetalle = useCallback((codigo: string) => {
    setCod(codigo);
    setVista("individual");
  }, []);

  const toggleSort = useCallback(
    (k: SortKey) => {
      if (k === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(k);
        setSortDir("desc");
      }
      setPage(1);
    },
    [sortKey],
  );

  const filasTabla = tablaData?.articulos ?? [];
  const totalPages = tablaData?.totalPages ?? 1;
  const pageClamped = tablaData?.page ?? page;

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

  // Carga automática del detalle al abrir la vista "individual" (clic en una
  // fila de la tabla, ver abrirDetalle) — la vista ya no tiene su propio
  // formulario/botón de búsqueda.
  useEffect(() => {
    if (vista === "individual" && cod.trim()) load();
  }, [vista, cod, load]);

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
            {vista === "individual"
              ? "Cantidad vendida por mes (pedidos Cerrados/Facturados) de un artículo en el rango de meses elegido, con total, promedio mensual, máximo, mínimo > 0 y stock actual por depósito."
              : "Buscá por código y/o línea, y hacé clic en una fila para ver el detalle mensual de ese artículo. Total vendido, promedio mensual, máximo, mínimo > 0 y stock actual por artículo."}
          </p>
        </div>

        {vista === "individual" && (
        <>
        {/* Detalle de un artículo — se abre desde la tabla, no tiene formulario propio */}
        <button
          type="button"
          onClick={() => setVista("tabla")}
          className="btn-anim inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-yellow-400 transition-colors"
        >
          <ChevronLeft size={16} /> Volver a la tabla
        </button>
        {/* Encabezado del detalle — el código llega del clic en la tabla, sin formulario propio */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-zinc-400 uppercase tracking-wide">Artículo</span>
          <span className="text-sm text-zinc-100 font-semibold">
            {cod || "—"}
            {data?.nombre ? ` — ${data.nombre}` : ""}
          </span>
          <span className="text-xs text-zinc-500">
            {fmtMesLabel(desde)} – {fmtMesLabel(hasta)}
          </span>
        </div>

        {!data && !loading && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
            <Search size={40} className="text-zinc-700" />
            <p className="text-zinc-500 text-sm">
              Volvé a la tabla y hacé clic en un artículo para ver su detalle.
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
        </>
        )}

        {vista === "tabla" && (
          <>
            {/* Filtros: rango de meses (compartido) + búsqueda rápida por código */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mes-desde-t" className="text-xs text-zinc-400 uppercase tracking-wide">
                  Desde (mes)
                </label>
                <input
                  id="mes-desde-t"
                  type="month"
                  value={desde}
                  max={hasta}
                  onChange={(e) => {
                    setDesde(e.target.value || mesLocal(5));
                    setPage(1);
                  }}
                  className="bg-[#1f1f1f] border border-zinc-700 rounded-md px-2 py-2 text-sm text-zinc-200 outline-none [color-scheme:dark] focus:border-yellow-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mes-hasta-t" className="text-xs text-zinc-400 uppercase tracking-wide">
                  Hasta (mes)
                </label>
                <input
                  id="mes-hasta-t"
                  type="month"
                  value={hasta}
                  min={desde}
                  max={mesLocal(0)}
                  onChange={(e) => {
                    setHasta(e.target.value || mesLocal(0));
                    setPage(1);
                  }}
                  className="bg-[#1f1f1f] border border-zinc-700 rounded-md px-2 py-2 text-sm text-zinc-200 outline-none [color-scheme:dark] focus:border-yellow-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="filtro-cod" className="text-xs text-zinc-400 uppercase tracking-wide">
                  Buscar código
                </label>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="filtro-cod"
                    type="text"
                    value={filtroCod}
                    onChange={(e) => setFiltroCod(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRefrescar()}
                    placeholder="Ej: E730020"
                    autoFocus
                    className="bg-[#1f1f1f] border border-zinc-700 rounded-md pl-7 pr-3 py-2 text-sm text-zinc-100 outline-none w-44 focus:border-yellow-400 placeholder:text-zinc-600"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="filtro-linea" className="text-xs text-zinc-400 uppercase tracking-wide">
                  Buscar línea {lineas.length > 0 && (
                    <span className="normal-case text-zinc-600">({lineas.length} en el catálogo)</span>
                  )}
                </label>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="filtro-linea"
                    type="text"
                    list="lineas-datalist"
                    value={filtroLinea}
                    onChange={(e) => setFiltroLinea(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRefrescar()}
                    placeholder="Ej: Premium"
                    className="bg-[#1f1f1f] border border-zinc-700 rounded-md pl-7 pr-3 py-2 text-sm text-zinc-100 outline-none w-48 focus:border-yellow-400 placeholder:text-zinc-600"
                  />
                  <datalist id="lineas-datalist">
                    {lineas.map((l) => (
                      <option key={l.linea} value={l.linea}>
                        {fmtNum(l.cantidadArticulos)} artículo(s)
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRefrescar}
                disabled={tablaLoading || !tieneEntrada}
                title="Escribir código/línea no busca solo — hay que presionar acá (o Enter)"
                className="btn-anim flex items-center gap-2 bg-yellow-400 text-black font-semibold text-sm rounded-md px-4 py-2 disabled:opacity-40"
              >
                {tablaLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                Refrescar
              </button>
              {tablaData && (
                <span className="text-sm text-zinc-500 pb-2">
                  {tablaData.total} artículo(s){tablaLoading ? " — actualizando…" : ""}
                </span>
              )}
            </div>

            {!tieneFiltro && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
                <Search size={40} className="text-zinc-700" />
                <p className="text-zinc-500 text-sm">
                  Ingresá un código y/o una línea, y presioná Refrescar (o Enter).
                </p>
              </div>
            )}

            {tieneFiltro && tablaError && (
              <div className="flex items-center gap-1.5 text-xs text-red-300">
                <AlertTriangle size={13} /> {tablaError}
              </div>
            )}

            {tieneFiltro && !tablaData && !tablaLoading && !tablaError && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
                <Table2 size={40} className="text-zinc-700" />
                <p className="text-zinc-500 text-sm">Cargando la tabla de artículos…</p>
              </div>
            )}

            {tieneFiltro && !tablaData && tablaLoading && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
                <Loader2 size={40} className="text-yellow-400 animate-spin" />
                <p className="text-zinc-500 text-sm">Consultando la base…</p>
              </div>
            )}

            {tablaData && filasTabla.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
                <Search size={40} className="text-zinc-700" />
                <p className="text-zinc-500 text-sm">Sin artículos que coincidan con la búsqueda.</p>
              </div>
            )}

            {tablaData && filasTabla.length > 0 && (
              <div
                className={`rounded-xl border border-zinc-800 overflow-hidden transition-opacity ${
                  tablaLoading ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max text-sm">
                    <thead className="bg-[#1A1A1A] text-zinc-400">
                      <tr>
                        <ThSort label="Código" sortKey="codigo" active={sortKey} dir={sortDir} onClick={toggleSort} />
                        <th className="px-3 py-2 font-medium text-left whitespace-nowrap">Artículo</th>
                        <ThSort label="Stock" sortKey="stock" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                        <ThSort label="Vendido" sortKey="totalVendido" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                        <ThSort label="Promedio" sortKey="promedio" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                        <ThSort label="Máximo" sortKey="maximo" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                        <th
                          className="px-3 py-2 font-medium text-right whitespace-nowrap text-zinc-400"
                          title="Máximo mensual / Stock actual"
                        >
                          Cobertura máx.
                        </th>
                        <ThSort label="Mínimo" sortKey="minimo" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                        <th
                          className="px-3 py-2 font-medium text-right whitespace-nowrap text-zinc-400"
                          title="Mínimo mensual / Stock actual"
                        >
                          Cobertura mín.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasTabla.map((r) => {
                        // Cobertura = máximo/mínimo mensual sobre el stock actual (pedido
                        // de Pablo 2026-08-12) — cuánto "pesa" un mes pico/piso frente a lo
                        // que hay en stock hoy. Sin stock (0) queda sin definir ("—").
                        const cobMax = r.stock > 0 ? r.maximo / r.stock : null;
                        const cobMin = r.stock > 0 && r.minimo != null ? r.minimo / r.stock : null;
                        // Semáforo por fila (pedido de Pablo 2026-08-12): promedio*2 vs
                        // stock actual — 2 meses de demanda promedio como referencia.
                        // Menos que eso en stock (promedio*2 < stock es FALSO) no entra acá;
                        // literal: promedio*2 < stock ⇒ rojo, promedio*2 > stock ⇒ verde,
                        // igualdad ⇒ sin color.
                        const tone =
                          r.promedio * 2 < r.stock ? "red" : r.promedio * 2 > r.stock ? "green" : null;
                        return (
                          <tr
                            key={r.codigo}
                            onClick={() => abrirDetalle(r.codigo)}
                            title="Ver detalle mensual de este artículo"
                            className={`border-t border-zinc-800/60 transition-colors cursor-pointer ${
                              tone === "red"
                                ? "bg-red-500/10 hover:bg-red-500/20"
                                : tone === "green"
                                  ? "bg-green-500/10 hover:bg-green-500/20"
                                  : "hover:bg-zinc-800/30"
                            }`}
                          >
                            <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">{r.codigo}</td>
                            <td className="px-3 py-2 text-zinc-100 whitespace-nowrap max-w-xs truncate">
                              {r.nombre ?? "—"}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums ${r.stock > 0 ? "text-green-400" : "text-zinc-600"}`}>
                              {fmtNum(r.stock)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-yellow-400 font-medium">
                              {fmtNum(r.totalVendido)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-200">
                              {fmtNum(r.promedio)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-orange-400">
                              {fmtNum(r.maximo)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-orange-300">
                              {cobMax !== null ? fmtNum(cobMax) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-blue-400">
                              {fmtNum(r.minimo)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-blue-300">
                              {cobMin !== null ? fmtNum(cobMin) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Paginación de a 20 (servidor) */}
                <div className="flex items-center justify-between gap-4 border-t border-zinc-800 bg-[#1A1A1A] px-4 py-2.5">
                  <span className="text-xs text-zinc-500">
                    Página {pageClamped} de {totalPages} — {tablaData.total} artículo(s)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={tablaLoading || pageClamped <= 1}
                      className="btn-anim p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:border-yellow-400 hover:text-yellow-400 disabled:opacity-30"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={tablaLoading || pageClamped >= totalPages}
                      className="btn-anim p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:border-yellow-400 hover:text-yellow-400 disabled:opacity-30"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
