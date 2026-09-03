"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, PackageX, ShoppingCart, PackageCheck, BarChart3,
  Package, Wallet, Download, Globe,
} from "lucide-react";
import * as XLSX from "xlsx";
import { InicioButton } from "@/components/ui/InicioButton";
import KpiCard from "@/app/rrhh/components/KpiCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import PieChartCard from "@/app/rrhh/components/charts/PieChartCard";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

// Los 3 orígenes que se trabajan en compras (Fábrica y Original tienen su
// propia vista / no se compran) — ver lib/compras/origenArticulo.ts.
type OrigenCompras = "nacionales" | "importados" | "otros";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/metricas — funnel mensual en ITEMS (artículos distintos) Y
// UNIDADES en cada etapa: Faltantes detectados en el mes → de esos, cuántos tuvieron una
// Orden de Compra ese mismo mes → de esos, cuántos ya ingresaron a la empresa
// ese mismo mes. Fuente: /api/compras/metricas (ver comentario ahí para el
// detalle de cada columna). Selector de mes, default = mes actual.
// ──────────────────────────────────────────────────────────────────────────────

interface Columna {
  key: string;
  label: string;
  total: number;       // items = artículos distintos
  unidades: number;    // unidades de esa etapa (faltantes / pedidas en OC / ingresadas)
  importe: number;     // $ de esa etapa (unidades × precio de venta del artículo)
}
// Un funnel por origen: la API los calcula todos de una (mismos 3 sets, en
// memoria), así el selector de origen cambia la vista SIN volver a consultar.
interface Funnel {
  faltantesUnidades: number;
  faltantesImporte: number;
  columnas: Columna[];
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
  // false = indicadores-api no informó el estado del artículo (columna no
  // detectada en StkFer_Articulos): NO se filtró por Habilitado.
  estadoArticuloDisponible: boolean;
  // Unidades descartadas por venir de pedidos cancelados o sin estado.
  unidadesDescartadas: number;
  // Toda la OC del mes (sin recortar por faltantes) — denominador de la card
  // "Con OC ese mes", que por el funnel solo cuenta los artículos faltantes.
  ocTotalItems: number;
  ocTotalUnidades: number;
  origenDefault: string;
  // Faltantes del mes clasificados por origen real del artículo: alimenta la
  // torta y los badges del selector.
  origenes: Grupo[];
  // nacionales | importados | otros | todos
  funnels: Record<string, Funnel>;
}

// /compras/compras-valorizado — mismo mes que el selector de arriba:
// unidades e $ de las OC hechas ese mes, valorizado a precio de VENTA (no al
// costo de la OC) (2026-08-04).
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
// Paleta de la torta (origen). Va por CLAVE, no por posición: la torta filtra
// las categorías en cero y con un array posicional los colores se corrían.
// Nacionales/Importados en los mismos tonos que el selector (sky/amber) para
// que chip y porción se asocien de una.
const ORIGEN_COLOR: Record<string, string> = {
  nacionales: "#4ADE80",
  importados: "#60A5FA",
  fabrica: "#C084FC",
  original: "#F472B6",
  otros: "#A1A1AA",
};

// Estilo del chip de origen, mismo criterio que /compras/faltantes.
const ORIGEN_CHIP: Record<string, string> = {
  nacionales: "bg-sky-500/15 border-sky-400 text-sky-300",
  importados: "bg-amber-500/15 border-amber-400 text-amber-300",
  otros: "bg-violet-500/15 border-violet-400 text-violet-300",
};
// Etiqueta del origen en el Excel, con los nombres de Magnus (así el archivo
// se puede cruzar contra el reporte del sector sin traducir nada).
const ORIGEN_EXCEL: Record<string, string> = {
  nacionales: "Nacional",
  importados: "Importado",
  fabrica: "Fabril",
  original: "Original",
  otros: "",
};
const ORIGEN_TITULO: Record<string, string> = {
  nacionales: "Nacionales",
  importados: "Importados",
  otros: "Otros",
};

const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0);
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n || 0);

// Valor de KpiCard apilado en 3 líneas (items / unidades / $) — las cards del
// funnel muestran las 3 magnitudes de la misma etapa una debajo de la otra, en
// lugar de repartirlas en una segunda fila de cards.
function StackedKpi({ items, unidades, importe }: { items: string; unidades: string; importe: string }) {
  return (
    <span className="block leading-tight tabular-nums">
      <span className="block">{items}</span>
      <span className="block text-lg font-semibold opacity-90">{unidades}</span>
      <span className="block text-lg font-semibold opacity-90">{importe}</span>
    </span>
  );
}

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

// /compras/faltantes-linea — faltantes marcados en /deposito/faltantes ese
// mismo mes, separados en Importados / Nacionales y agrupados por LÍNEA (no
// por artículo) (2026-08-26).
interface FilaLinea {
  linea: string;
  items: number;
  cantFaltante: number;
  cantComprada: number;
  monto: number;
}
interface GrupoLineas {
  label?: string;
  lineas: FilaLinea[];
  total: { items: number; cantFaltante: number; cantComprada: number; monto: number };
}
interface FaltLineaResp {
  mes: string;
  desde: string;
  hasta: string;
  ocWarn: boolean;
  clasifWarn: boolean;
  lineaWarn: boolean;
  estadoArticuloDisponible: boolean;
  // fabrica / original / sinRenglon / noHabilitado: por qué quedó afuera cada
  // artículo marcado que no entra en ninguna de las 3 tablas.
  excluidos: Record<string, number>;
  excluidosFabrica: number;
  articulosFaltantes: number;
  importados: GrupoLineas;
  nacionales: GrupoLineas;
  otros: GrupoLineas;
}

export default function ComprasMetricasPage() {
  const [mes, setMes] = useState(mesActual);
  // Origen del artículo. Toda la vista (cards, funnel y tabla por línea) habla
  // del origen elegido; arranca en Nacionales, que es el grueso de compras.
  const [origen, setOrigen] = useState<OrigenCompras>("nacionales");
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

  // Faltantes del mes agrupados por línea, separados Importados/Nacionales —
  // mismo mes del selector de arriba, sin controles propios.
  const [faltLinea, setFaltLinea] = useState<FaltLineaResp | null>(null);
  const [faltLineaLoading, setFaltLineaLoading] = useState(false);
  const [faltLineaError, setFaltLineaError] = useState<string | null>(null);

  const loadFaltLinea = useCallback(async (m: string) => {
    setFaltLineaLoading(true);
    setFaltLineaError(null);
    try {
      const res = await fetch(`/api/compras/faltantes-linea?mes=${encodeURIComponent(m)}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setFaltLinea(j);
    } catch (e) {
      setFaltLineaError(e instanceof Error ? e.message : "Error al cargar");
      setFaltLinea(null);
    } finally {
      setFaltLineaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFaltLinea(mes);
  }, [mes, loadFaltLinea]);

  // Funnel del origen elegido — ya viene calculado en la respuesta, cambiar de
  // origen no dispara ninguna consulta.
  const funnel = useMemo(() => data?.funnels?.[origen], [data, origen]);

  // "Otros" (artículo sin tipo cargado en Magnus) solo aparece si hay alguno,
  // igual que en /compras/faltantes: en el caso normal el chip es un toggle de
  // dos posiciones.
  const hayOtros = useMemo(
    () => (data?.origenes ?? []).some((g) => g.key === "otros" && g.total > 0),
    [data],
  );
  const ciclarOrigen = useCallback(() => {
    setOrigen((o) => {
      if (o === "nacionales") return "importados";
      if (o === "importados") return hayOtros ? "otros" : "nacionales";
      return "nacionales";
    });
  }, [hayOtros]);
  // Si "Otros" queda vacío tras cambiar de mes, no dejar la vista clavada ahí.
  useEffect(() => {
    if (origen === "otros" && !hayOtros) setOrigen("nacionales");
  }, [origen, hayOtros]);

  const itemsOrigen = useMemo(
    () => (data?.origenes ?? []).find((g) => g.key === origen)?.total ?? 0,
    [data, origen],
  );

  const chartData = useMemo(
    () => (funnel?.columnas ?? []).map((c) => ({ name: c.label, value: c.total })),
    [funnel],
  );

  // La torta muestra TODOS los orígenes del mes (incluidos Fábrica y Original,
  // que compras no trabaja) para que se vea de dónde sale el recorte.
  const pieVisible = useMemo(
    () => (data?.origenes ?? []).filter((g) => g.total > 0),
    [data],
  );
  const pieData = useMemo(
    () => pieVisible.map((g) => ({ name: g.label, value: g.total })),
    [pieVisible],
  );
  const pieColors = useMemo(
    () => pieVisible.map((g) => ORIGEN_COLOR[g.key] ?? "#A1A1AA"),
    [pieVisible],
  );

  const col = useCallback(
    (key: string) => funnel?.columnas.find((c) => c.key === key)?.total ?? 0,
    [funnel],
  );
  // Unidades de la etapa (mismo recorte del funnel que los items).
  const unid = useCallback(
    (key: string) => funnel?.columnas.find((c) => c.key === key)?.unidades ?? 0,
    [funnel],
  );
  // $ de la etapa (unidades × precio de venta del artículo, lo calcula la API).
  const imp = useCallback(
    (key: string) => funnel?.columnas.find((c) => c.key === key)?.importe ?? 0,
    [funnel],
  );

  // Export a Excel: una fila por artículo del mes con faltante / OC (y sus
  // números) / ingreso (y sus remitos). Los datos se piden recién al apretar el
  // botón (/api/compras/detalle-mes) — es la consulta más pesada de la vista y
  // no tiene sentido pagarla en cada carga de página. El .xlsx se arma en el
  // browser, mismo patrón que /compras/pases.
  const [exportando, setExportando] = useState(false);

  const exportar = useCallback(async () => {
    setExportando(true);
    try {
      const res = await fetch(`/api/compras/detalle-mes?mes=${encodeURIComponent(mes)}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

      const filas = (j.rows ?? []).map(
        (r: {
          codArticulo: string;
          nombre: string | null;
          proveedor: string | null;
          origen: string | null;
          estadoArticulo: string | null;
          esFaltante: boolean;
          cantFaltante: number;
          cantOC: number;
          nroOCs: string[];
          fechaUltimaOC: string | null;
          cantIngresada: number;
          nroRemitos: string[];
          fechaUltimoIngreso: string | null;
        }) => ({
          "Código": r.codArticulo,
          "Artículo": r.nombre || "",
          Proveedor: r.proveedor || "",
          "Origen": ORIGEN_EXCEL[r.origen ?? ""] ?? "",
          "Estado": r.estadoArticulo || "",
          "¿Faltante?": r.esFaltante ? "Sí" : "No",
          "Cant. faltante": r.cantFaltante,
          "Cant. en OC": r.cantOC,
          "N° de OC": r.nroOCs.join(", "),
          "Última OC": r.fechaUltimaOC || "",
          "Cant. ingresada": r.cantIngresada,
          "N° de remitos": r.nroRemitos.join(", "),
          "Último ingreso": r.fechaUltimoIngreso || "",
        }),
      );
      if (!filas.length) {
        setError("No hay movimientos para exportar en ese mes");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(filas);
      const cols = Object.keys(filas[0]);
      ws["!cols"] = cols.map((c) => {
        let max = c.length;
        for (const f of filas) max = Math.max(max, String((f as Record<string, unknown>)[c] ?? "").length);
        return { wch: Math.min(Math.max(max + 2, 8), 60) };
      });
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({
        s: { c: 0, r: 0 },
        e: { c: cols.length - 1, r: filas.length },
      }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Faltantes OC e ingresos");
      XLSX.writeFile(wb, `compras_faltantes_oc_ingresos_${mes}.xlsx`);

      if ((j.warns ?? []).length) setError((j.warns as string[]).join(" · "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }, [mes]);

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
            onClick={ciclarOrigen}
            title={
              hayOtros
                ? "Origen del artículo — click para alternar: Nacionales / Importados / Otros"
                : "Origen del artículo — click para alternar: Nacionales / Importados"
            }
            className={`chip-anim flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium ${
              ORIGEN_CHIP[origen] ?? ORIGEN_CHIP.nacionales
            }`}
          >
            <Globe size={14} />
            {ORIGEN_TITULO[origen] ?? origen}
            <span className="tabular-nums opacity-70">{fmtNum(itemsOrigen)}</span>
          </button>
          <button
            onClick={exportar}
            title="Exportar a Excel: artículo por artículo, faltante / OC / ingreso del mes"
            disabled={exportando}
            className="btn-anim flex items-center gap-1.5 bg-[#1f1f1f] border border-zinc-700 hover:border-yellow-400 hover:text-yellow-400 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 disabled:opacity-40"
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span className="hidden sm:inline">Excel</span>
          </button>
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
            <span className="text-zinc-500 font-normal normal-case tracking-normal text-base">
              · {ORIGEN_TITULO[origen] ?? origen}
            </span>
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Artículos habilitados marcados sin existencia en {fmtMesLabel(mes)}, sin los renglones
            de pedidos cancelados. El origen sale del tipo de artículo de Magnus — mismo criterio
            que Compras → Faltantes.
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
            No se pudo leer el origen de los artículos — el recorte por Nacional/Importado no se aplicó
          </div>
        )}
        {data && !data.clasifWarn && !data.estadoArticuloDisponible && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
            <AlertTriangle size={13} />
            No se pudo leer el estado del artículo — entran también Suspendidos y de Baja
          </div>
        )}


        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Faltantes del mes"
            value={<StackedKpi items={`${fmtNum(col("faltantes"))} items`} unidades={`${fmtNum(unid("faltantes"))} u.`} importe={fmtMoney(imp("faltantes"))} />}
            hint="Artículos marcados sin existencia, sus unidades pendientes y cuánto faltó en $ (a precio de venta)"
            icon={PackageX}
            accent="orange"
          />
          <KpiCard
            label="Con OC ese mes"
            value={<StackedKpi items={`${fmtNum(col("conOC"))} de ${fmtNum(data?.ocTotalItems ?? 0)} items`} unidades={`${fmtNum(unid("conOC"))} u.`} importe={fmtMoney(imp("conOC"))} />}
            hint={`De los faltantes, con Orden de Compra — unidades pedidas en esas OC y su $. El total son los ${fmtNum(data?.ocTotalItems ?? 0)} items (${fmtNum(data?.ocTotalUnidades ?? 0)} u.) con OC ese mes, faltantes o no`}
            icon={ShoppingCart}
            accent="blue"
          />
          <KpiCard
            label="Ingresados ese mes"
            value={<StackedKpi items={`${fmtNum(col("ingresados"))} items`} unidades={`${fmtNum(unid("ingresados"))} u.`} importe={fmtMoney(imp("ingresados"))} />}
            hint="De esos, ya recibidos en depósito — unidades ingresadas por remito y su $"
            icon={PackageCheck}
            accent="green"
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
                colors={pieColors}
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

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 space-y-5">
          <div>
            <h2 className="text-yellow-400 font-bold text-lg uppercase tracking-wide flex items-center gap-2">
              <PackageX size={18} /> Faltantes por línea — {fmtMesLabel(mes)}
              {faltLineaLoading && <Loader2 size={15} className="animate-spin text-yellow-400" />}
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              Artículos marcados como faltantes en <b>Depósito → Faltantes</b> durante{" "}
              {fmtMesLabel(mes)}, agrupados por línea, con el mismo recorte que las cards de
              arriba (origen {ORIGEN_TITULO[origen] ?? origen}, habilitados, sin pedidos
              cancelados). La cantidad faltante es la que marcó el operario; la comprada son las
              unidades de OC hechas ese mismo mes para esos mismos artículos, valorizadas a precio
              de VENTA. Lo de fábrica y los Original no se muestran acá.
            </p>
          </div>

          {faltLineaError && (
            <div className="flex items-center gap-1.5 text-xs text-red-300">
              <AlertTriangle size={13} /> {faltLineaError}
            </div>
          )}
          {faltLinea?.ocWarn && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
              <AlertTriangle size={13} /> OC del mes no disponible — comprado y $ pueden estar incompletos
            </div>
          )}
          {faltLinea?.clasifWarn && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
              <AlertTriangle size={13} /> No se pudo leer el origen ni la línea de los artículos — figuran como “SIN LÍNEA”
            </div>
          )}
          {!!faltLinea?.excluidos && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <AlertTriangle size={13} /> Fuera de estas tablas:{" "}
              {fmtNum(faltLinea.excluidos.fabrica ?? 0)} de fábrica ·{" "}
              {fmtNum(faltLinea.excluidos.original ?? 0)} Original ·{" "}
              {fmtNum(faltLinea.excluidos.noHabilitado ?? 0)} no habilitados o solo por pedidos
              cancelados · {fmtNum(faltLinea.excluidos.sinRenglon ?? 0)} sin renglón vivo en Magnus
            </div>
          )}

          <TablaLineas
            titulo={ORIGEN_TITULO[origen] ?? origen}
            grupo={faltLinea?.[origen]}
            loading={faltLineaLoading}
            accent={ORIGEN_COLOR[origen] ?? "#A1A1AA"}
          />
        </div>
      </main>
    </div>
  );
}

// Tabla de un grupo (Importados o Nacionales): una fila por línea + fila de
// total. Se muestra cantidad faltante, cantidad comprada por OC y su valor a
// precio de venta.
function TablaLineas({
  titulo,
  grupo,
  loading,
  accent,
}: {
  titulo: string;
  grupo?: GrupoLineas;
  loading: boolean;
  accent: string;
}) {
  const filas = grupo?.lineas ?? [];
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/70 border-b border-zinc-800">
        <span className="font-semibold text-sm uppercase tracking-wide" style={{ color: accent }}>
          {titulo}
        </span>
        <span className="text-xs text-zinc-500">
          {fmtNum(grupo?.total.items ?? 0)} artículo(s) · {filas.length} línea(s)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 text-xs uppercase tracking-wide">
              <th className="text-left font-medium px-4 py-2">Línea</th>
              <th className="text-right font-medium px-3 py-2">Faltante</th>
              <th className="text-right font-medium px-3 py-2">Comprado</th>
              <th className="text-right font-medium px-4 py-2">$ comprado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.linea} className="border-t border-zinc-800/70 hover:bg-zinc-800/30">
                <td className="px-4 py-2 text-zinc-200">
                  {f.linea}
                  <span className="text-zinc-600 text-xs ml-2">({fmtNum(f.items)})</span>
                </td>
                <td className="px-3 py-2 text-right text-orange-300 tabular-nums">{fmtNum(f.cantFaltante)}</td>
                <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{fmtNum(f.cantComprada)}</td>
                <td className="px-4 py-2 text-right text-yellow-300 tabular-nums">{fmtMoney(f.monto)}</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500 text-sm">
                  {loading ? "Consultando la base…" : "Sin faltantes en este grupo."}
                </td>
              </tr>
            )}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-zinc-700 bg-zinc-900/60 font-semibold">
                <td className="px-4 py-2 text-zinc-300 uppercase text-xs tracking-wide">Total</td>
                <td className="px-3 py-2 text-right text-orange-300 tabular-nums">
                  {fmtNum(grupo?.total.cantFaltante ?? 0)}
                </td>
                <td className="px-3 py-2 text-right text-zinc-200 tabular-nums">
                  {fmtNum(grupo?.total.cantComprada ?? 0)}
                </td>
                <td className="px-4 py-2 text-right text-yellow-300 tabular-nums">
                  {fmtMoney(grupo?.total.monto ?? 0)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
