"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Undo2,
  Check,
  X,
  PackageCheck,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// Faltantes — renglones pendientes del último día con registro (anterior a hoy).
//   PC      : tabla con vendedor + marcado por fila (verde/rojo).
//   Celular : pantalla completa, 1 artículo a la vez (detalles apilados),
//             Deshacer arriba · En existencia (verde) / Sin existencia (rojo) abajo.
//   Cada marca se guarda al instante en Postgres (preparado.faltante_existencia).
// ──────────────────────────────────────────────────────────────────────────────

interface Item {
  NroPedOrigen: number;
  NroRengOrigen: number;
  Ubicacion: number | string | null;
  CodArticulo: string;
  Nombre: string;
  CantPend: number;
  Cliente: number | string | null;
  Importe: number;
  TipoArticulo: string | null;
  Preparador: string | null;
  Linea: string | number | null;
  Proveedor: string | null;
  Vendedor: string | null;
}
type Estado = "pendiente" | "si" | "no";
interface Mark {
  nroPedOrigen: number;
  nroRengOrigen: number;
  codArticulo: string;
  existencia: boolean;
}

const keyOf = (it: { NroPedOrigen: number; NroRengOrigen: number }) =>
  `${it.NroPedOrigen}-${it.NroRengOrigen}`;
const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtAr = (s: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};

export default function FaltantesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [fecha, setFecha] = useState("");
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [idx, setIdx] = useState(0); // puntero del flujo móvil
  const [undoStack, setUndoStack] = useState<
    { key: string; prev: Estado; idx: number }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fRes = await fetch("/api/deposito/faltantes", {
        cache: "no-store",
      });
      const fj = await fRes.json().catch(() => ({}));
      if (!fRes.ok) throw new Error(fj.error || `HTTP ${fRes.status}`);
      const rows: Item[] = fj.rows ?? [];
      const fch: string = fj.fecha ?? "";
      setItems(rows);
      setFecha(fch);

      const est: Record<string, Estado> = {};
      if (fch) {
        const cRes = await fetch(`/api/deposito/faltantes/check?fecha=${fch}`, {
          cache: "no-store",
        });
        if (cRes.ok) {
          const cj = await cRes.json().catch(() => ({ rows: [] }));
          for (const m of (cj.rows ?? []) as Mark[])
            est[`${m.nroPedOrigen}-${m.nroRengOrigen}`] = m.existencia
              ? "si"
              : "no";
        }
      }
      setEstados(est);
      setUndoStack([]);
      const first = rows.findIndex((r) => !est[keyOf(r)]);
      setIdx(first < 0 ? rows.length : first);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    (it: Item, existencia: boolean) =>
      fetch("/api/deposito/faltantes/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          nroPedOrigen: it.NroPedOrigen,
          nroRengOrigen: it.NroRengOrigen,
          codArticulo: it.CodArticulo,
          existencia,
        }),
      }).catch(() => setError("No se pudo guardar la marca")),
    [fecha],
  );

  // Celular: marca y avanza al siguiente.
  const mark = useCallback(
    (it: Item, existencia: boolean) => {
      const k = keyOf(it);
      setUndoStack((u) => [
        ...u,
        { key: k, prev: estados[k] ?? "pendiente", idx },
      ]);
      setEstados((s) => ({ ...s, [k]: existencia ? "si" : "no" }));
      setIdx((i) => Math.min(i + 1, items.length));
      void persist(it, existencia);
    },
    [estados, idx, items.length, persist],
  );

  // PC: marca por fila sin mover el puntero móvil.
  const markRow = useCallback(
    (it: Item, existencia: boolean) => {
      const k = keyOf(it);
      setUndoStack((u) => [
        ...u,
        { key: k, prev: estados[k] ?? "pendiente", idx },
      ]);
      setEstados((s) => ({ ...s, [k]: existencia ? "si" : "no" }));
      void persist(it, existencia);
    },
    [estados, idx, persist],
  );

  const undo = useCallback(() => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((u) => u.slice(0, -1));
    setEstados((s) => {
      const n = { ...s };
      if (last.prev === "pendiente") delete n[last.key];
      else n[last.key] = last.prev;
      return n;
    });
    setIdx(last.idx);
    const [ped, reng] = last.key.split("-").map(Number);
    const body =
      last.prev === "pendiente"
        ? {
            method: "DELETE",
            payload: { fecha, nroPedOrigen: ped, nroRengOrigen: reng },
          }
        : {
            method: "POST",
            payload: {
              fecha,
              nroPedOrigen: ped,
              nroRengOrigen: reng,
              codArticulo: "",
              existencia: last.prev === "si",
            },
          };
    fetch("/api/deposito/faltantes/check", {
      method: body.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body.payload),
    }).catch(() => setError("No se pudo deshacer"));
  }, [undoStack, fecha]);

  const counts = useMemo(() => {
    let si = 0,
      no = 0;
    for (const it of items) {
      const e = estados[keyOf(it)];
      if (e === "si") si++;
      else if (e === "no") no++;
    }
    return { si, no, pend: items.length - si - no, total: items.length };
  }, [items, estados]);

  const current = items[idx];
  const hay = items.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ════════════ CELULAR: pantalla completa, 1 artículo ════════════ */}
      <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-[#111111] text-white">
        <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-zinc-800">
          <button
            onClick={undo}
            disabled={!undoStack.length}
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 disabled:opacity-30 active:text-yellow-400"
          >
            <Undo2 size={18} /> Deshacer
          </button>
          <div className="text-right leading-tight">
            <div className="text-sm font-semibold text-yellow-400">
              {Math.min(counts.si + counts.no + 1, counts.total)} /{" "}
              {counts.total}
            </div>
            <div className="text-[11px] text-zinc-500">{fmtAr(fecha)}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && !hay ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 size={36} className="animate-spin text-yellow-400" />{" "}
              Cargando…
            </div>
          ) : !hay ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center text-zinc-400">
              <PackageCheck size={44} className="text-zinc-700" />
              {error ? error : "No hay faltantes para revisar."}
            </div>
          ) : !current ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
              <PackageCheck size={56} className="text-green-500" />
              <p className="text-lg font-semibold">Revisión completa</p>
              <p className="text-sm text-zinc-400">
                {counts.si} en existencia · {counts.no} sin existencia ·{" "}
                {counts.total} total
              </p>
              <button
                onClick={undo}
                disabled={!undoStack.length}
                className="mt-2 flex items-center gap-1.5 text-sm text-zinc-300 disabled:opacity-30"
              >
                <Undo2 size={16} /> Deshacer último
              </button>
            </div>
          ) : (
            <CardDetalle
              it={current}
              estado={estados[keyOf(current)] ?? "pendiente"}
            />
          )}
        </div>

        {hay && current && (
          <div className="shrink-0 grid grid-cols-2 gap-px bg-zinc-800">
            <button
              onClick={() => mark(current, true)}
              className="h-24 flex flex-col items-center justify-center gap-1 bg-green-600 active:bg-green-700 text-white font-bold text-lg"
            >
              <Check size={28} /> En existencia
            </button>
            <button
              onClick={() => mark(current, false)}
              className="h-24 flex flex-col items-center justify-center gap-1 bg-red-600 active:bg-red-700 text-white font-bold text-lg"
            >
              <X size={28} /> Sin existencia
            </button>
          </div>
        )}
      </div>

      {/* ════════════ PC: tabla con vendedor + marcado por fila ════════════ */}
      <div className="hidden md:block min-h-screen bg-[#111111] text-white">
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

        <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex items-center justify-between px-8 h-16 gap-4">
          <div className="flex items-center gap-4">
            <span className="font-bold text-yellow-400 text-2xl tracking-wide uppercase">
              EVER WEAR{" "}
              <span className="text-sm tracking-[3px] font-normal">S.A.</span>
            </span>
            <div className="w-px h-7 bg-yellow-400/30" />
            <span className="text-zinc-500 text-sm">
              Faltantes · {fmtAr(fecha)}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-400">
              <b className="text-green-400">{counts.si}</b> en exist. ·{" "}
              <b className="text-red-400">{counts.no}</b> sin ·{" "}
              <b className="text-yellow-400">{counts.pend}</b> pend. ·{" "}
              <b className="text-zinc-200">{counts.total}</b> total
            </span>
            <button
              onClick={undo}
              disabled={!undoStack.length}
              title="Deshacer"
              className="flex items-center gap-1.5 text-zinc-400 hover:text-yellow-400 disabled:opacity-30 transition-colors"
            >
              <Undo2 size={16} /> Deshacer
            </button>
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

        <main className="max-w-[1500px] mx-auto px-8 py-6">
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
                  : "No hay faltantes para revisar."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-[#1A1A1A] text-zinc-400 sticky">
                  <tr className="text-left">
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Ubic.
                    </th>
                    <th className="px-3 py-2.5 font-medium">Cód.</th>
                    <th className="px-3 py-2.5 font-medium">Nombre</th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Cant.
                    </th>
                    {/* <th className="px-3 py-2.5 font-medium">Cliente</th> */}
                    {/* <th className="px-3 py-2.5 font-medium">Vendedor</th> */}
                    {/* <th className="px-3 py-2.5 font-medium text-right">Importe</th> */}
                    {/* <th className="px-3 py-2.5 font-medium">Tipo</th> */}
                    {/* <th className="px-3 py-2.5 font-medium">Línea</th> */}
                    <th className="px-3 py-2.5 font-medium">Preparador</th>
                    {/* <th className="px-3 py-2.5 font-medium">Proveedor</th> */}
                    <th className="px-3 py-2.5 font-medium text-center">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const e = estados[keyOf(it)] ?? "pendiente";
                    return (
                      <tr
                        key={keyOf(it)}
                        className={`border-t border-zinc-800/70 mt-5${
                          e === "si"
                            ? "bg-green-950/30"
                            : e === "no"
                              ? "bg-red-950/30"
                              : "hover:bg-zinc-900/50"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <Pill e={e} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                          {it.Ubicacion ?? "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-zinc-300">
                          {it.CodArticulo}
                        </td>
                        <td className="px-3 py-2 text-zinc-100">{it.Nombre}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtNum(it.CantPend)}
                        </td>
                        {/* <td className="px-3 py-2 text-zinc-300">{it.Cliente ?? "—"}</td> */}
                        {/* <td className="px-3 py-2 text-zinc-300">{it.Vendedor || "—"}</td> */}
                        {/* <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                          ${fmtNum(it.Importe)}
                        </td> */}
                        {/* <td className="px-3 py-2 text-zinc-400">{it.TipoArticulo || "—"}</td> */}
                        {/* <td className="px-3 py-2 text-zinc-400">{it.Linea ?? "—"}</td> */}
                        <td className="px-3 py-2 text-zinc-400">
                          {it.Preparador || "—"}
                        </td>
                        {/* <td className="px-3 py-2 text-zinc-400">{it.Proveedor || "—"}</td> */}
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => markRow(it, true)}
                              title="En existencia"
                              className={`p-1.5 rounded-md border ${
                                e === "si"
                                  ? "bg-green-600 border-green-600 text-white"
                                  : "border-zinc-700 text-green-500 hover:bg-green-600/20"
                              }`}
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={() => markRow(it, false)}
                              title="Sin existencia"
                              className={`p-1.5 rounded-md border ${
                                e === "no"
                                  ? "bg-red-600 border-red-600 text-white"
                                  : "border-zinc-700 text-red-500 hover:bg-red-600/20"
                              }`}
                            >
                              <X size={15} />
                            </button>
                          </div>
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
    </>
  );
}

function Pill({ e }: { e: Estado }) {
  if (e === "si")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-600/20 text-green-400 px-2 py-0.5 text-xs font-medium">
        <Check size={12} /> En exist.
      </span>
    );
  if (e === "no")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-600/20 text-red-400 px-2 py-0.5 text-xs font-medium">
        <X size={12} /> Sin exist.
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-zinc-700/40 text-zinc-400 px-2 py-0.5 text-xs">
      Pendiente
    </span>
  );
}

function Row({
  label,
  value,
  big,
}: {
  label: string;
  value: React.ReactNode;
  big?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800/70 py-2.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span
        className={`text-right ${big ? "text-2xl font-bold" : "text-base"} text-zinc-100`}
      >
        {value}
      </span>
    </div>
  );
}

function CardDetalle({ it, estado }: { it: Item; estado: Estado }) {
  return (
    <div className="px-5 py-4">
      {estado !== "pendiente" && (
        <div className="mb-2">
          <Pill e={estado} />
        </div>
      )}
      <h2 className="text-2xl font-bold leading-tight text-white mb-1">
        {it.Nombre || "—"}
      </h2>
      <p className="font-mono text-sm text-yellow-400 mb-3">{it.CodArticulo}</p>
      <Row label="Ubicación" value={it.Ubicacion ?? "—"} big />
      <Row label="Cant. pendiente" value={fmtNum(it.CantPend)} big />
      <Row label="Vendedor" value={it.Vendedor || "—"} />
      <Row label="Cliente" value={it.Cliente ?? "—"} />
      <Row label="Importe" value={`$${fmtNum(it.Importe)}`} />
      <Row label="Línea" value={it.Linea ?? "—"} />
      <Row label="Tipo artículo" value={it.TipoArticulo || "—"} />
      <Row label="Preparador" value={it.Preparador || "—"} />
      <Row label="Proveedor" value={it.Proveedor || "—"} />
    </div>
  );
}
