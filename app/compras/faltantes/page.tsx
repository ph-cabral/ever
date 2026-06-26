"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, PackageCheck, Truck,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/faltantes — items "sin existencia" (preparado.faltante_existencia,
//   existencia=false; mismo universo que /deposito/faltantes/control) AGRUPADOS
//   POR ARTÍCULO. A cada artículo se le suma la cantidad faltante y se le cruza
//   lo que ya está "por llegar" en Órdenes de Compra (Magnus, solo lectura, vía
//   /api/compras/ordenes → indicadores-api). Columna "Llegarán".
//
//   Color de fila (igual criterio que /faltantes):
//     · verde  → lo por llegar CUBRE el faltante (llegarán ≥ faltan)
//     · rojo   → está ordenado pero NO alcanza (0 < llegarán < faltan)
//     · neutro → no hay ninguna OC (llegarán = 0) → queda como antes
//
//   Filtro: Todos / Ordenados completos / Ordenados incompletos / Sin orden.
//   Solo lectura. La marca de existencia se hace en /deposito/faltantes/control.
// ──────────────────────────────────────────────────────────────────────────────

interface Item {
  NroPedOrigen: number;
  NroRengOrigen: number;
  CodArticulo: string;
  Nombre: string;
  CantPend: number;
  Cliente: number | string | null;
  Importe: number;
  Preparador: string | null;
  Vendedor: string | null;
  Proveedor: string | null;
  Linea: string | number | null;
}
interface Mark {
  nroPedOrigen: number;
  nroRengOrigen: number;
  existencia: boolean;
}
// Fila de OC agregada por artículo que devuelve /api/compras/ordenes
interface OcRow {
  CodArticulo: string;
  PorLlegar: number;
  Proveedor: string | null;
  FechaEntrega: string | null; // ISO yyyy-mm-dd o null
  Importacion: boolean;
  NroOCs: string[];
}

type Estado = "completo" | "incompleto" | "sin_orden";
type Filtro = "todos" | Estado;

// Fila agregada por artículo
interface ArtRow {
  CodArticulo: string;
  Nombre: string;
  Linea: string | number | null;
  Proveedor: string | null;
  faltan: number;
  importe: number;
  renglones: number;
  pedidos: Set<number>;
  llegaran: number;
  fechaEntrega: string | null;
  importacion: boolean;
  ocs: string[];
  estado: Estado;
}

const keyOf = (it: { NroPedOrigen: number; NroRengOrigen: number }) =>
  `${it.NroPedOrigen}-${it.NroRengOrigen}`;
const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtAr = (s: string | null) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};

function estadoDe(faltan: number, llegaran: number): Estado {
  if (llegaran <= 0) return "sin_orden";
  if (llegaran >= faltan) return "completo";
  return "incompleto";
}

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "completo", label: "Ordenados completos" },
  { key: "incompleto", label: "Ordenados incompletos" },
  { key: "sin_orden", label: "Sin orden" },
];

// Clases de color de fila por estado
const rowCls: Record<Estado, string> = {
  completo: "bg-green-500/10 hover:bg-green-500/[0.16]",
  incompleto: "bg-red-500/10 hover:bg-red-500/[0.16]",
  sin_orden: "hover:bg-zinc-900/50",
};
const llegaranCls: Record<Estado, string> = {
  completo: "text-green-400",
  incompleto: "text-red-400",
  sin_orden: "text-zinc-600",
};

export default function ComprasFaltantesPage() {
  const [arts, setArts] = useState<ArtRow[]>([]);
  const [fecha, setFecha] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocWarn, setOcWarn] = useState(false); // OC no disponible (backend pendiente)

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOcWarn(false);
    try {
      // 1) faltantes del día
      const fRes = await fetch("/api/deposito/faltantes", { cache: "no-store" });
      const fj = await fRes.json().catch(() => ({}));
      if (!fRes.ok) throw new Error(fj.error || `HTTP ${fRes.status}`);
      const rows: Item[] = fj.rows ?? [];
      const fch: string = fj.fecha ?? "";
      setFecha(fch);

      // 2) marcas "sin existencia" + 3) órdenes de compra (por llegar), en paralelo
      const sin = new Set<string>();
      const oc = new Map<string, OcRow>();

      const [cRes, oRes] = await Promise.all([
        fch
          ? fetch(`/api/deposito/faltantes/check?fecha=${fch}`, { cache: "no-store" })
          : Promise.resolve(null),
        fetch("/api/compras/ordenes", { cache: "no-store" }).catch(() => null),
      ]);

      if (cRes && cRes.ok) {
        const cj = await cRes.json().catch(() => ({ rows: [] }));
        for (const m of (cj.rows ?? []) as Mark[])
          if (!m.existencia) sin.add(`${m.nroPedOrigen}-${m.nroRengOrigen}`);
      }

      if (oRes && oRes.ok) {
        const oj = await oRes.json().catch(() => ({ rows: [] }));
        for (const r of (oj.rows ?? []) as OcRow[]) {
          const cod = String(r.CodArticulo ?? "").trim();
          if (cod) oc.set(cod, r);
        }
      } else {
        setOcWarn(true); // la vista sigue: todo queda "sin orden"
      }

      // Solo "sin existencia", agregado por artículo
      const sinExistencia = rows.filter((r) => sin.has(keyOf(r)));
      const byArt = new Map<string, ArtRow>();
      for (const it of sinExistencia) {
        const cod = String(it.CodArticulo ?? "").trim();
        let a = byArt.get(cod);
        if (!a) {
          a = {
            CodArticulo: cod,
            Nombre: it.Nombre,
            Linea: it.Linea ?? null,
            Proveedor: it.Proveedor,
            faltan: 0,
            importe: 0,
            renglones: 0,
            pedidos: new Set<number>(),
            llegaran: 0,
            fechaEntrega: null,
            importacion: false,
            ocs: [],
            estado: "sin_orden",
          };
          byArt.set(cod, a);
        }
        a.faltan += it.CantPend || 0;
        a.importe += it.Importe || 0;
        a.renglones += 1;
        a.pedidos.add(it.NroPedOrigen);
        if (!a.Proveedor && it.Proveedor) a.Proveedor = it.Proveedor;
        if ((a.Linea === null || a.Linea === "") && it.Linea != null && it.Linea !== "")
          a.Linea = it.Linea;
      }

      // Cruce con OC
      for (const a of byArt.values()) {
        const r = oc.get(a.CodArticulo);
        if (r) {
          a.llegaran = r.PorLlegar || 0;
          a.fechaEntrega = r.FechaEntrega ?? null;
          a.importacion = !!r.Importacion;
          a.ocs = r.NroOCs ?? [];
          if (!a.Proveedor && r.Proveedor) a.Proveedor = r.Proveedor;
        }
        a.estado = estadoDe(a.faltan, a.llegaran);
      }

      const lista = [...byArt.values()].sort((x, y) => y.importe - x.importe);
      setArts(lista);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setArts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const conteo = useMemo(() => {
    const c = { todos: arts.length, completo: 0, incompleto: 0, sin_orden: 0 };
    for (const a of arts) c[a.estado]++;
    return c as Record<Filtro, number>;
  }, [arts]);

  const visibles = useMemo(
    () => (filtro === "todos" ? arts : arts.filter((a) => a.estado === filtro)),
    [arts, filtro],
  );

  const tot = useMemo(() => {
    let faltan = 0, llegaran = 0, importe = 0;
    for (const a of visibles) {
      faltan += a.faltan;
      llegaran += a.llegaran;
      importe += a.importe;
    }
    return { art: visibles.length, faltan, llegaran, importe };
  }, [visibles]);

  const hay = arts.length > 0;

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
            Faltantes a encargar · {fmtAr(fecha)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline text-zinc-400">
            <b className="text-yellow-400">{tot.art}</b> art. ·{" "}
            <b className="text-zinc-200">faltan {fmtNum(tot.faltan)}</b> ·{" "}
            <b className="text-green-400">llegan {fmtNum(tot.llegaran)}</b>
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
        {/* Filtros por estado de orden */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {FILTROS.map((f) => (
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
                  <th className="px-3 py-2 font-medium">Línea</th>
                  <th className="px-3 py-2 font-medium text-right">Faltan</th>
                  <th className="px-3 py-2 font-medium text-right">Llegarán</th>
                  <th className="px-3 py-2 font-medium">Entrega</th>
                  <th className="px-3 py-2 font-medium">Proveedor</th>
                  <th className="px-3 py-2 font-medium text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a) => (
                  <tr
                    key={a.CodArticulo}
                    className={`border-t border-zinc-800/70 transition-colors ${rowCls[a.estado]}`}
                  >
                    <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">
                      {a.CodArticulo}
                    </td>
                    <td className="px-3 py-2 text-zinc-100">
                      <span>{a.Nombre}</span>
                      {a.pedidos.size > 1 && (
                        <span className="ml-2 text-[11px] text-zinc-500">
                          {a.pedidos.size} pedidos
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {a.Linea ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-100">
                      {fmtNum(a.faltan)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${llegaranCls[a.estado]}`}
                    >
                      {a.llegaran > 0 ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          <Truck size={13} className="opacity-70" />
                          {fmtNum(a.llegaran)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {a.llegaran > 0
                        ? a.importacion
                          ? <span className="text-amber-400/80">Importación</span>
                          : fmtAr(a.fechaEntrega)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{a.Proveedor || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                      ${fmtNum(a.importe)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
