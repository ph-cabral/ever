"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  PackageCheck,
  Truck,
  Check,
  Download,
  Trash2,
  X,
} from "lucide-react";
import { exportarFaltantesCompras } from "@/lib/compras/exportFaltantes";
import { origenArticulo } from "@/lib/compras/origenArticulo";
import { InicioButton } from "@/components/ui/InicioButton";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

// ──────────────────────────────────────────────────────────────────────────────
// /fabrica/faltantes — mismo cruce faltante×OC que /compras/faltantes (misma
//   fuente: /api/fabrica/faltantes, que reexporta /api/compras/faltantes-
//   consumo sin duplicar lógica), acotado a un solo proveedor: EVER WEAR S.A.
//   INDUSTRIAL. Recorte respecto de /compras/faltantes:
//     · Sin botón "Extraordinario" (🚩) ni reverso — acá no aplica.
//     · Sin "Agrupar por proveedor" — es un solo proveedor, no tiene sentido.
//     · Sin selector Desde/Hasta — rango fijo (ancla OC → hoy), sin inputs.
//     · Sin toggle "Ver con arribo" — se usa el default (oculta buckets ya
//       100% arribados), sin botón para revelarlos.
//   Se mantiene: matcheo contra OC (Cubre OC / Falta OC / Despacho), stock en
//   vivo, filtros por estado, export a Excel y descartar fila.
// ──────────────────────────────────────────────────────────────────────────────

type Estado = "completo" | "incompleto" | "sin_orden" | "entregado";
type Filtro = "todos" | Estado;

interface Row {
  CodArticulo: string;
  Nombre: string;
  Linea: string | number | null;
  Proveedor: string | null;
  clientes: { cod: string; nombre: string | null; cant: number }[];
  fecha: string; // día del faltante (primera aparición)
  vivo: boolean;
  faltan: number; // acumulado hasta este día
  nuevoDelDia: number;
  stock: number; // existencia real depósito 1 (WMS, en vivo)
  cubierto: number;
  descubierto: number;
  importe: number;
  renglones: number;
  pedidos: number;
  ocTotal: number;
  fechaEntrega: string | null;
  importacion: boolean;
  tipoArticulo: string | null; // "Nacional"/"Importado"/"Original"/"Fabrica" (Magnus) — clasificación de origen
  ocs: string[];
  estado: Estado;
  extraordinario: boolean;
  comprar: boolean | null;
  fechaArribo: string | null;
  tieneArribo: boolean;
}

// Universo de esta vista: todo lo de fábrica. Ya no es solo el proveedor
// EVER WEAR S.A. INDUSTRIAL — también entra el artículo de tipo Fabril
// (Magnus StkFer_Articulos.NacionalImportado) aunque venga con otro proveedor.
// Al revés también: desde 2026-09-03 el tipo decide siempre, así que lo
// comprado a EVER WEAR con tipo Nacional/Importado/Original NO es de fábrica
// (el proveedor solo clasifica cuando el artículo no tiene tipo cargado).
// Esos mismos artículos quedan FUERA de /compras/faltantes, así que el
// criterio es uno solo y vive en lib/compras/origenArticulo.ts.
const esDeFabrica = (r: { Proveedor: string | null; tipoArticulo?: string | null }) =>
  origenArticulo(r) === "fabrica";

const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtAr = (s: string | null) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};
const addDaysISO = (iso: string, days: number) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Rango fijo (sin selector): mismo ancla que /compras/faltantes
// (OC_DESDE_DEFAULT del backend) → hoy.
const DESDE_FIJO = "2026-06-26";
const rowKey = (r: Pick<Row, "CodArticulo" | "fecha">) =>
  `${r.CodArticulo}__${r.fecha}`;

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "incompleto", label: "Parciales" },
  { key: "sin_orden", label: "Sin OC" },
];

const rowCls: Record<Estado, string> = {
  completo: "bg-green-500/10 hover:bg-green-500/[0.16]",
  entregado: "bg-emerald-500/10 hover:bg-emerald-500/[0.16]",
  incompleto: "bg-red-500/10 hover:bg-red-500/[0.16]",
  // sin_orden = stock+OC no cubre nada (peor caso, no neutro) → misma fila roja.
  sin_orden: "bg-red-500/10 hover:bg-red-500/[0.16]",
};
const cubiertoCls: Record<Estado, string> = {
  completo: "text-green-400",
  entregado: "text-emerald-400",
  incompleto: "text-amber-400",
  sin_orden: "text-zinc-600",
};

function ClientesCell({ clientes }: { clientes: Row["clientes"] }) {
  const [open, setOpen] = useState(false);
  if (!clientes.length) return <span className="text-zinc-600">—</span>;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-300 hover:text-yellow-400 underline underline-offset-2 decoration-dotted whitespace-nowrap"
      >
        {clientes.length} cliente{clientes.length > 1 ? "s" : ""}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-[#1A1A1A] border border-zinc-700 rounded-xl max-w-md w-full max-h-[70vh] overflow-y-auto p-4"
              onClick={(e) => e.stopPropagation()}
            >
              {" "}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-zinc-200">
                  {clientes.length} cliente{clientes.length > 1 ? "s" : ""}{" "}
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  className="text-zinc-500 hover:text-zinc-200 p-1"
                >
                  <X size={16} />
                </button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {clientes.map((c) => (
                  <li
                    key={c.cod}
                    className="text-xs text-zinc-300 flex justify-between gap-3"
                  >
                    <span className="truncate">
                      {c.cod}
                      {c.nombre ? ` — ${c.nombre}` : ""}
                    </span>
                    {clientes.length > 1 && (
                      <span className="text-zinc-500 shrink-0 tabular-nums">
                        {fmtNum(c.cant)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// Tabla única (sin acordeón por proveedor: es un solo proveedor). Sin columna
// de "Extraordinario" (🚩) — acá no aplica.
function Tabla({
  data,
  onArribo,
  onDescartar,
  leaving = {},
}: {
  data: Row[];
  onArribo: (row: Row, fechaArribo: string | null) => void;
  onDescartar: (row: Row) => void;
  leaving?: Record<string, "left" | "right">;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-[#1A1A1A] text-zinc-400">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium whitespace-nowrap">Cód.</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">
                Artículo
              </th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Línea</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Día</th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
                Faltan
              </th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
                Stock
              </th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
                En OC
              </th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
                Falta OC
              </th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">
                Despacho
              </th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">
                Cliente
              </th>
              <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
                Importe
              </th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">
                Arribo
              </th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const prev = data[i - 1];
              const nuevoArt = !prev || prev.CodArticulo !== r.CodArticulo;
              const dir = leaving[rowKey(r)];
              return (
                <tr
                  key={rowKey(r)}
                  className={`transition-colors animate-in fade-in duration-300 ${
                    dir === "right"
                      ? "row-out-right"
                      : dir === "left"
                        ? "row-out-left"
                        : ""
                  } ${rowCls[r.estado]} ${
                    nuevoArt
                      ? "border-t-2 border-zinc-700/80"
                      : "border-t border-zinc-800/50"
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">
                    {r.CodArticulo}
                  </td>
                  <td className="px-3 py-2 text-zinc-100 whitespace-nowrap">
                    <span>{r.Nombre}</span>
                  </td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                    {r.Linea ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap tabular-nums">
                    {fmtAr(r.fecha)}
                    {r.pedidos > 1 && (
                      <span className="ml-2 text-[11px] text-zinc-600">
                        {r.pedidos} ped.
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-right tabular-nums text-zinc-100"
                    title={
                      r.vivo && r.nuevoDelDia !== r.faltan
                        ? `Acumulado. Nuevo este día: ${fmtNum(r.nuevoDelDia)}`
                        : undefined
                    }
                  >
                    {fmtNum(r.faltan)}
                    {r.vivo &&
                      r.nuevoDelDia > 0 &&
                      r.nuevoDelDia !== r.faltan && (
                        <span className="ml-1 text-[11px] text-zinc-600">
                          (+{fmtNum(r.nuevoDelDia)})
                        </span>
                      )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.stock > 0 ? "text-emerald-400" : "text-zinc-600"
                    }`}
                    title="Existencia real en depósito 1, en vivo (mismo dato que /deposito/stock)."
                  >
                    {r.stock > 0 ? fmtNum(r.stock) : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${cubiertoCls[r.estado]}`}
                    title="Cantidad total pedida en la OC pendiente para este artículo (no acotada al faltante)."
                  >
                    {r.ocTotal > 0 ? (
                      <span className="inline-flex items-center gap-1 justify-end">
                        {r.estado === "entregado" ? (
                          <Check size={13} className="opacity-80" />
                        ) : (
                          <Truck size={13} className="opacity-70" />
                        )}
                        {fmtNum(r.ocTotal)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-300/90">
                    {r.descubierto > 0 ? fmtNum(r.descubierto) : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                    {r.estado === "entregado" ? (
                      <span className="text-emerald-400/80">Entregado</span>
                    ) : r.cubierto > 0 ? (
                      r.importacion ? (
                        <span className="text-amber-400/80">Importación</span>
                      ) : (
                        fmtAr(r.fechaEntrega)
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                    <ClientesCell clientes={r.clientes} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                    ${fmtNum(r.importe)}
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const sugerido =
                        !r.fechaArribo && r.fechaEntrega
                          ? addDaysISO(r.fechaEntrega, 2)
                          : null;
                      return (
                        <input
                          type="date"
                          value={r.fechaArribo ?? sugerido ?? ""}
                          onChange={(e) => onArribo(r, e.target.value || null)}
                          title={
                            r.tieneArribo
                              ? "Ya cargada"
                              : sugerido
                                ? "Sugerido: Despacho + 2 días. No guardado — editá para confirmar."
                                : "Cargar fecha de arribo"
                          }
                          className={`bg-[#1f1f1f] border rounded-md px-2 py-1 text-xs outline-none [color-scheme:dark] ${
                            r.tieneArribo
                              ? "border-emerald-600 text-emerald-300"
                              : sugerido
                                ? "border-dashed border-zinc-600 text-zinc-400 focus:border-yellow-400"
                                : "border-zinc-700 text-zinc-200 focus:border-yellow-400"
                          }`}
                        />
                      );
                    })()}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => onDescartar(r)}
                      disabled={!!dir}
                      title="Descartar (no se borra de la base, solo deja de mostrarse acá)"
                      className="btn-anim text-zinc-600 hover:text-red-400 p-1 disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FabricaFaltantesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocWarn, setOcWarn] = useState(false);
  const [ocDesde, setOcDesde] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Record<string, "left" | "right">>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOcWarn(false);
    try {
      const p = new URLSearchParams();
      p.set("desde", DESDE_FIJO);
      p.set("hasta", todayISO());
      const res = await fetch(`/api/fabrica/faltantes?${p}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.rows ?? []);
      setFecha(j.fecha ?? null);
      setOcDesde(j.ocDesde ?? null);
      setOcWarn(!!j.ocWarn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const EXIT_MS = 260;

  const guardarArribo = useCallback(
    async (row: Row, fechaArribo: string | null) => {
      const prev = {
        fechaArribo: row.fechaArribo,
        tieneArribo: row.tieneArribo,
      };
      setRows((rs) =>
        rs.map((r) =>
          rowKey(r) === rowKey(row)
            ? { ...r, fechaArribo, tieneArribo: !!fechaArribo }
            : r,
        ),
      );
      try {
        const res = await fetch("/api/fabrica/faltantes-arribo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha: row.fecha,
            codArticulo: row.CodArticulo,
            fechaArribo,
          }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setRows((rs) =>
          rs.map((r) => (rowKey(r) === rowKey(row) ? { ...r, ...prev } : r)),
        );
        setError("No se pudo guardar la fecha de arribo");
      }
    },
    [],
  );

  const descartarFaltante = useCallback((row: Row) => {
    const k = rowKey(row);
    setLeaving((m) => ({ ...m, [k]: "right" }));
    window.setTimeout(async () => {
      setRows((rs) => rs.filter((r) => rowKey(r) !== k));
      setLeaving((m) => {
        const n = { ...m };
        delete n[k];
        return n;
      });
      try {
        const res = await fetch("/api/fabrica/faltantes-descartar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha: row.fecha,
            codArticulo: row.CodArticulo,
            descartado: true,
          }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setRows((rs) => [...rs, row]);
        setError("No se pudo descartar el renglón");
      }
    }, EXIT_MS);
  }, []);

  // Nunca extraordinario, y acotado a lo de fábrica (proveedor EVER WEAR S.A.
  // INDUSTRIAL o artículo de tipo Fabril).
  const frontRows = useMemo(
    () => rows.filter((r) => !r.extraordinario && esDeFabrica(r)),
    [rows],
  );

  // 1 fila por artículo: las "vivo" son buckets acumulados, se colapsan a la
  // más reciente por CodArticulo; las "entregado" (histórico) se muestran todas.
  const porArticulo = useMemo(() => {
    const ultimaVivaPorArt = new Map<string, Row>();
    const historicas: Row[] = [];
    for (const r of frontRows) {
      if (r.vivo) {
        const prev = ultimaVivaPorArt.get(r.CodArticulo);
        if (!prev || r.fecha > prev.fecha)
          ultimaVivaPorArt.set(r.CodArticulo, r);
      } else {
        historicas.push(r);
      }
    }
    return [...historicas, ...ultimaVivaPorArt.values()];
  }, [frontRows]);

  const conteo = useMemo(() => {
    const c = {
      todos: porArticulo.length,
      completo: 0,
      incompleto: 0,
      sin_orden: 0,
      entregado: 0,
    };
    for (const r of porArticulo) c[r.estado]++;
    return c as Record<Filtro, number>;
  }, [porArticulo]);

  // Orden: artículo por importe total desc, día asc dentro del artículo.
  const visibles = useMemo(() => {
    const base =
      filtro === "todos"
        ? porArticulo
        : porArticulo.filter((r) => r.estado === filtro);
    const artImporte = new Map<string, number>();
    for (const r of base)
      artImporte.set(
        r.CodArticulo,
        (artImporte.get(r.CodArticulo) ?? 0) + r.importe,
      );
    return [...base].sort((a, b) => {
      const dArt =
        (artImporte.get(b.CodArticulo) ?? 0) -
        (artImporte.get(a.CodArticulo) ?? 0);
      if (dArt !== 0) return dArt;
      if (a.CodArticulo !== b.CodArticulo)
        return a.CodArticulo < b.CodArticulo ? -1 : 1;
      return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
    });
  }, [porArticulo, filtro]);

  const exportar = useCallback(() => {
    exportarFaltantesCompras(visibles, {
      modo: "faltantes",
      desde: DESDE_FIJO,
      hasta: todayISO(),
    });
  }, [visibles]);

  const tot = useMemo(() => {
    let importe = 0;
    const arts = new Set<string>();
    const ultimaVivaPorArt = new Map<string, Row>();
    let faltan = 0,
      cubierto = 0,
      descubierto = 0;
    for (const r of visibles) {
      importe += r.importe;
      arts.add(r.CodArticulo);
      if (r.vivo) {
        const prev = ultimaVivaPorArt.get(r.CodArticulo);
        if (!prev || r.fecha > prev.fecha)
          ultimaVivaPorArt.set(r.CodArticulo, r);
      } else {
        faltan += r.faltan;
        cubierto += r.cubierto;
        descubierto += r.descubierto;
      }
    }
    for (const r of ultimaVivaPorArt.values()) {
      faltan += r.faltan;
      cubierto += r.cubierto;
      descubierto += r.descubierto;
    }
    return { art: arts.size, faltan, cubierto, descubierto, importe };
  }, [visibles]);

  const hay = frontRows.length > 0;

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {(loading || error) && (
        <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2">
          {loading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" />{" "}
              Consultando la base…
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
            EVER WEAR{" "}
            <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="hidden md:block w-px h-7 bg-yellow-400/30" />
          <span className="hidden md:inline text-zinc-500 text-sm">
            Faltantes fábrica · {fmtAr(fecha)}
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
            className="btn-anim text-zinc-400 hover:text-yellow-400 p-2 disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <UsuarioActual />
        </div>
      </header>

      <main className="max-w-[1900px] mx-auto px-3 md:px-8 py-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={exportar}
            disabled={visibles.length === 0}
            title="Exportar a Excel lo que se ve en la tabla"
            className="chip-anim flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-yellow-400 hover:text-yellow-400 text-xs font-medium disabled:opacity-40"
          >
            <Download size={14} /> Excel
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

          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`chip-anim flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium ${
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
              <AlertTriangle size={13} /> OC no disponible — todo figura sin
              orden
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
                : "No hay faltantes de fábrica."}
            </p>
          </div>
        ) : (
          <Tabla
            data={visibles}
            onArribo={guardarArribo}
            onDescartar={descartarFaltante}
            leaving={leaving}
          />
        )}
      </main>
    </div>
  );
}
