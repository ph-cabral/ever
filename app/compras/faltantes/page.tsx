"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, PackageCheck, Truck, CalendarRange, History, Check,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/faltantes — faltantes "sin existencia" por (artículo, día) con la OC
//   restada por día.
//
//   · Default: solo el último snapshot (como antes).
//   · Filtro "Desde": amplía el rango hacia atrás. Cada renglón cuenta una sola
//     vez, en su DÍA DE APARICIÓN (no se doble-cuenta el backlog que se repite).
//   · La OC "por llegar" (Magnus, en vivo) se reparte FIFO por fecha: cubre primero
//     el día más viejo y se va agotando. Una misma OC ya no figura cubriendo varios
//     días.
//
//   Color de fila por estado del DÍA:
//     · verde  → la OC que llegó a ese día cubre el faltante (descubierto = 0)
//     · rojo   → la OC alcanzó en parte (0 < cubierto < faltan)
//     · neutro → a ese día no le llegó OC (cubierto = 0)
//
//   Solo lectura. La marca de existencia se hace en /deposito/faltantes/control.
//   El consumo por día se guarda solo (preparado.faltante_oc_consumo).
// ──────────────────────────────────────────────────────────────────────────────

type Estado = "completo" | "incompleto" | "sin_orden" | "entregado";
type Filtro = "todos" | Estado;

interface Row {
  CodArticulo: string;
  Nombre: string;
  Linea: string | number | null;
  Proveedor: string | null;
  fecha: string; // día del faltante (primera aparición)
  vivo: boolean; // false = histórico ya entregado/cubierto
  faltan: number;
  cubierto: number;
  descubierto: number;
  importe: number;
  renglones: number;
  pedidos: number;
  ocTotal: number;
  fechaEntrega: string | null;
  importacion: boolean;
  ocs: string[];
  estado: Estado;
}

const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtAr = (s: string | null) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "completo", label: "Cubiertos" },
  { key: "incompleto", label: "Parciales" },
  { key: "sin_orden", label: "Sin OC" },
  { key: "entregado", label: "Entregados" },
];

const rowCls: Record<Estado, string> = {
  completo: "bg-green-500/10 hover:bg-green-500/[0.16]",
  entregado: "bg-emerald-500/10 hover:bg-emerald-500/[0.16]",
  incompleto: "bg-red-500/10 hover:bg-red-500/[0.16]",
  sin_orden: "hover:bg-zinc-900/50",
};
const cubiertoCls: Record<Estado, string> = {
  completo: "text-green-400",
  entregado: "text-emerald-400",
  incompleto: "text-amber-400",
  sin_orden: "text-zinc-600",
};

export default function ComprasFaltantesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [desdeResp, setDesdeResp] = useState<string | null>(null);
  const [hastaResp, setHastaResp] = useState<string | null>(null);
  const [desde, setDesde] = useState(""); // "" = solo último día
  const [historico, setHistorico] = useState(false); // ver también ya entregados
  const [fechasDisp, setFechasDisp] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocWarn, setOcWarn] = useState(false);
  const [ocDesde, setOcDesde] = useState<string | null>(null);

  // Snapshots disponibles (para el selector "Desde")
  useEffect(() => {
    fetch("/api/deposito/faltantes/fechas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { fechas: [] }))
      .then((j) => setFechasDisp(j.fechas ?? []))
      .catch(() => setFechasDisp([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOcWarn(false);
    try {
      const p = new URLSearchParams();
      if (desde) p.set("desde", desde);
      if (historico) p.set("historico", "1");
      const qs = p.toString() ? `?${p}` : "";
      const res = await fetch(`/api/compras/faltantes-consumo${qs}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.rows ?? []);
      setFecha(j.fecha ?? null);
      setDesdeResp(j.desde ?? null);
      setHastaResp(j.hasta ?? null);
      setOcDesde(j.ocDesde ?? null);
      setOcWarn(!!j.ocWarn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [desde, historico]);

  useEffect(() => {
    load();
  }, [load]);

  const conteo = useMemo(() => {
    const c = { todos: rows.length, completo: 0, incompleto: 0, sin_orden: 0, entregado: 0 };
    for (const r of rows) c[r.estado]++;
    return c as Record<Filtro, number>;
  }, [rows]);

  const visibles = useMemo(
    () => (filtro === "todos" ? rows : rows.filter((r) => r.estado === filtro)),
    [rows, filtro],
  );

  const tot = useMemo(() => {
    let faltan = 0, cubierto = 0, descubierto = 0, importe = 0;
    const arts = new Set<string>();
    for (const r of visibles) {
      faltan += r.faltan;
      cubierto += r.cubierto;
      descubierto += r.descubierto;
      importe += r.importe;
      arts.add(r.CodArticulo);
    }
    return { art: arts.size, dias: visibles.length, faltan, cubierto, descubierto, importe };
  }, [visibles]);

  const rango =
    desdeResp && hastaResp && desdeResp !== hastaResp
      ? `${fmtAr(desdeResp)} – ${fmtAr(hastaResp)}`
      : fmtAr(fecha);

  const hay = rows.length > 0;

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
          <span className="font-bold text-yellow-400 text-xl md:text-2xl tracking-wide uppercase whitespace-nowrap">
            EVER WEAR <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="hidden md:block w-px h-7 bg-yellow-400/30" />
          <span className="hidden md:inline text-zinc-500 text-sm">
            Faltantes a encargar · {rango}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline text-zinc-400">
            <b className="text-yellow-400">{tot.art}</b> art. ·{" "}
            <b className="text-zinc-200">faltan {fmtNum(tot.faltan)}</b> ·{" "}
            <b className="text-green-400">cubren {fmtNum(tot.cubierto)}</b> ·{" "}
            <b className="text-red-400">faltan OC {fmtNum(tot.descubierto)}</b>
          </span>
          <button
            onClick={load}
            title="Refrescar"
            disabled={loading}
            className="text-zinc-400 hover:text-yellow-400 transition-colors p-2 disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-3 md:px-8 py-6">
        {/* Selector de rango + filtros por estado */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 mr-2">
            <CalendarRange size={15} className="text-zinc-500" />
            <select
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-[#1A1A1A] border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:border-yellow-400 outline-none"
            >
              <option value="">Solo último día</option>
              {fechasDisp.map((f, i) => (
                <option key={f} value={f}>
                  Desde {fmtAr(f)}
                  {i === 0 ? " (último)" : ""}
                </option>
              ))}
            </select>
            {desde && (
              <button
                onClick={() => setDesde("")}
                className="text-xs text-zinc-500 hover:text-yellow-400 underline underline-offset-2"
              >
                volver al último día
              </button>
            )}
          </div>

          <button
            onClick={() => setHistorico((v) => !v)}
            title="Incluir los faltantes históricos ya entregados/cubiertos del rango"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
              historico
                ? "bg-emerald-500/15 border-emerald-400 text-emerald-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            <History size={14} />
            Ver histórico
            {historico && <Check size={13} />}
          </button>

          {ocDesde && (
            <span
              title="El cruce con OC arranca en esta fecha: solo se cuentan las órdenes de compra y los faltantes desde acá."
              className="text-[11px] text-zinc-500 whitespace-nowrap"
            >
              OC desde {fmtAr(ocDesde)}
            </span>
          )}

          <div className="w-px h-5 bg-zinc-800 hidden sm:block" />

          {FILTROS.filter((f) => f.key !== "entregado" || historico).map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                filtro === f.key
                  ? "bg-yellow-400/15 border-yellow-400 text-yellow-300"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {f.label}
              <span
                className={`tabular-nums ${
                  filtro === f.key ? "text-yellow-200/80" : "text-zinc-500"
                }`}
              >
                {conteo[f.key] ?? 0}
              </span>
            </button>
          ))}
          {ocWarn && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400/80 ml-1">
              <AlertTriangle size={13} /> OC no disponible — todo figura sin orden
            </span>
          )}
        </div>

        {!hay ? (
          <div className="flex flex-col items-center justify-center py-28 gap-3 text-center">
            {loading ? (
              <Loader2 size={40} className="text-yellow-400 animate-spin" />
            ) : (
              <PackageCheck size={44} className="text-zinc-700" />
            )}
            <p className="text-zinc-400 font-medium">
              {loading
                ? "Consultando la base…"
                : "No hay faltantes marcados como “sin existencia”."}
            </p>
            {!loading && (
              <a
                href="/deposito/faltantes/control"
                className="text-sm text-yellow-400/80 hover:text-yellow-400 underline underline-offset-4"
              >
                Ir al control de faltantes →
              </a>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-[#1A1A1A] text-zinc-400">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Cód.</th>
                  <th className="px-3 py-2 font-medium">Artículo</th>
                  <th className="px-3 py-2 font-medium">Día</th>
                  <th className="px-3 py-2 font-medium text-right">Faltan</th>
                  <th className="px-3 py-2 font-medium text-right">Cubre OC</th>
                  <th className="px-3 py-2 font-medium text-right">Falta OC</th>
                  <th className="px-3 py-2 font-medium">Entrega</th>
                  <th className="px-3 py-2 font-medium">Proveedor</th>
                  <th className="px-3 py-2 font-medium text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r, i) => {
                  const prev = visibles[i - 1];
                  const nuevoArt = !prev || prev.CodArticulo !== r.CodArticulo;
                  return (
                    <tr
                      key={`${r.CodArticulo}-${r.fecha}`}
                      className={`transition-colors ${rowCls[r.estado]} ${
                        nuevoArt ? "border-t-2 border-zinc-700/80" : "border-t border-zinc-800/50"
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">
                        {nuevoArt ? r.CodArticulo : ""}
                      </td>
                      <td className="px-3 py-2 text-zinc-100">
                        {nuevoArt ? (
                          <span>
                            {r.Nombre}
                            {r.ocTotal > 0 && (
                              <span className="ml-2 text-[11px] text-zinc-500">
                                OC total {fmtNum(r.ocTotal)}
                              </span>
                            )}
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-400 whitespace-nowrap tabular-nums">
                        {fmtAr(r.fecha)}
                        {r.pedidos > 1 && (
                          <span className="ml-2 text-[11px] text-zinc-600">{r.pedidos} ped.</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-100">
                        {fmtNum(r.faltan)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${cubiertoCls[r.estado]}`}
                      >
                        {r.cubierto > 0 ? (
                          <span className="inline-flex items-center gap-1 justify-end">
                            {r.estado === "entregado" ? (
                              <Check size={13} className="opacity-80" />
                            ) : (
                              <Truck size={13} className="opacity-70" />
                            )}
                            {fmtNum(r.cubierto)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-300/90">
                        {r.descubierto > 0 ? fmtNum(r.descubierto) : "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                        {r.estado === "entregado"
                          ? <span className="text-emerald-400/80">Entregado</span>
                          : r.cubierto > 0
                            ? r.importacion
                              ? <span className="text-amber-400/80">Importación</span>
                              : fmtAr(r.fechaEntrega)
                            : "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{nuevoArt ? r.Proveedor || "—" : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                        ${fmtNum(r.importe)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
