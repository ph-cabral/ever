"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, PackageCheck,
  Check, X, CalendarDays,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// Control de faltantes — solo renglones marcados "sin existencia" en /faltantes.
//   Se agrupan por NroPedOrigen (más nuevo arriba). Cada pedido es una tabla
//   siempre visible (sin acordeón). Solo se ven los renglones SIN fecha de
//   arribo (al cargarla, el renglón se oculta al instante).
//   Header del grupo: pedido · cliente · vendedor · preparador.
//   Tabla de artículos: línea (renglón), cód, nombre, cant, importe + por renglón:
//     · Fecha de arribo (input date)
//     · ¿El cliente lo sigue queriendo?  Sí / No
//   Cada cambio se guarda al instante en preparado.faltante_control.
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
  Preparador: string | null;
  Vendedor: string | null;
}
interface Ctrl {
  fechaArribo: string | null;
  clienteQuiere: boolean | null;
}
interface Grupo {
  ped: number;
  cliente: number | string | null;
  vendedor: string;
  preparador: string;
  items: Item[];
  importe: number;
}
interface Mark {
  nroPedOrigen: number;
  nroRengOrigen: number;
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

export default function ControlFaltantesPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [fecha, setFecha] = useState("");
  const [ctrl, setCtrl] = useState<Record<string, Ctrl>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) faltantes del día + 2) marcas de existencia (para filtrar "sin existencia")
      const fRes = await fetch("/api/deposito/faltantes", { cache: "no-store" });
      const fj = await fRes.json().catch(() => ({}));
      if (!fRes.ok) throw new Error(fj.error || `HTTP ${fRes.status}`);
      const rows: Item[] = fj.rows ?? [];
      const fch: string = fj.fecha ?? "";
      setFecha(fch);

      const sin = new Set<string>();
      const ctrlMap: Record<string, Ctrl> = {};
      if (fch) {
        const [cRes, kRes] = await Promise.all([
          fetch(`/api/deposito/faltantes/check?fecha=${fch}`, { cache: "no-store" }),
          fetch(`/api/deposito/faltantes/control?fecha=${fch}`, { cache: "no-store" }),
        ]);
        if (cRes.ok) {
          const cj = await cRes.json().catch(() => ({ rows: [] }));
          for (const m of (cj.rows ?? []) as Mark[])
            if (!m.existencia) sin.add(`${m.nroPedOrigen}-${m.nroRengOrigen}`);
        }
        if (kRes.ok) {
          const kj = await kRes.json().catch(() => ({ rows: [] }));
          for (const r of (kj.rows ?? []) as (Ctrl & {
            nroPedOrigen: number;
            nroRengOrigen: number;
          })[])
            ctrlMap[`${r.nroPedOrigen}-${r.nroRengOrigen}`] = {
              fechaArribo: r.fechaArribo ?? null,
              clienteQuiere: r.clienteQuiere ?? null,
            };
        }
      }

      // Solo "sin existencia", agrupado por pedido. El ocultar los que ya tienen
      // fecha de arribo se hace en el render (vis): se ocultan al instante al
      // cargar la fecha y las estadísticas siguen contando el total.
      const faltan = rows.filter((r) => sin.has(keyOf(r)));
      const byPed = new Map<number, Grupo>();
      for (const it of faltan) {
        let g = byPed.get(it.NroPedOrigen);
        if (!g) {
          g = {
            ped: it.NroPedOrigen,
            cliente: it.Cliente,
            vendedor: it.Vendedor || "",
            preparador: it.Preparador || "",
            items: [],
            importe: 0,
          };
          byPed.set(it.NroPedOrigen, g);
        }
        g.items.push(it);
        g.importe += it.Importe || 0;
        if (!g.vendedor && it.Vendedor) g.vendedor = it.Vendedor;
        if (!g.preparador && it.Preparador) g.preparador = it.Preparador;
      }
      const grp = [...byPed.values()].sort((a, b) => b.ped - a.ped); // más nuevo arriba

      setCtrl(ctrlMap);
      setGrupos(grp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setGrupos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    (it: Item, patch: Partial<Ctrl>) => {
      const k = keyOf(it);
      setCtrl((m) => {
        const next: Ctrl = {
          fechaArribo: null,
          clienteQuiere: null,
          ...(m[k] ?? {}),
          ...patch,
        };
        fetch("/api/deposito/faltantes/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha,
            nroPedOrigen: it.NroPedOrigen,
            nroRengOrigen: it.NroRengOrigen,
            codArticulo: it.CodArticulo,
            fechaArribo: next.fechaArribo,
            clienteQuiere: next.clienteQuiere,
          }),
        }).catch(() => setError("No se pudo guardar"));
        return { ...m, [k]: next };
      });
    },
    [fecha],
  );

  // Visibles: solo renglones SIN fecha de arribo (se ocultan al instante al
  // cargarla). Los pedidos que quedan sin renglones desaparecen.
  const vis = useMemo(
    () =>
      grupos
        .map((g) => ({
          ...g,
          items: g.items.filter((it) => !ctrl[keyOf(it)]?.fechaArribo),
        }))
        .filter((g) => g.items.length > 0),
    [grupos, ctrl],
  );

  const tot = useMemo(() => {
    let art = 0, arribo = 0, noQ = 0;
    for (const g of grupos)
      for (const it of g.items) {
        const c = ctrl[keyOf(it)];
        if (c?.fechaArribo) {
          arribo++;
          continue; // ya tiene arribo → resuelto, no es pendiente
        }
        art++;
        if (c?.clienteQuiere === false) noQ++;
      }
    return { ped: vis.length, art, arribo, noQ };
  }, [grupos, vis, ctrl]);

  const hay = vis.length > 0;

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
            Control de faltantes · {fmtAr(fecha)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline text-zinc-400">
            <b className="text-zinc-200">{tot.ped}</b> ped. ·{" "}
            <b className="text-yellow-400">{tot.art}</b> art. ·{" "}
            <b className="text-green-400">{tot.arribo}</b> c/arribo ·{" "}
            <b className="text-red-400">{tot.noQ}</b> no quiere
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
                : "No hay faltantes “sin existencia” pendientes de arribo."}
            </p>
            {!loading && (
              <a
                href="/deposito/faltantes"
                className="text-sm text-yellow-400/80 hover:text-yellow-400 underline underline-offset-4"
              >
                Ir a marcar faltantes →
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {vis.map((g) => (
              <GrupoCard key={g.ped} g={g} ctrl={ctrl} onSave={save} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function GrupoCard({
  g, ctrl, onSave,
}: {
  g: Grupo;
  ctrl: Record<string, Ctrl>;
  onSave: (it: Item, patch: Partial<Ctrl>) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#161616] overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3 bg-[#1A1A1A] border-b border-zinc-800">
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 min-w-0">
          <Campo label="Pedido" value={<span className="font-mono text-yellow-400">{g.ped}</span>} />
          <Campo label="Cliente" value={g.cliente ?? "—"} />
          <Campo label="Vendedor" value={g.vendedor || "—"} />
          <Campo label="Preparador" value={g.preparador || "—"} />
        </div>
        <div className="shrink-0 text-right hidden sm:block">
          <div className="text-xs text-zinc-500">{g.items.length} art.</div>
          <div className="text-sm tabular-nums text-zinc-200">${fmtNum(g.importe)}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#141414] text-zinc-400">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Línea</th>
              <th className="px-3 py-2 font-medium">Cód.</th>
              <th className="px-3 py-2 font-medium">Artículo</th>
              <th className="px-3 py-2 font-medium text-right">Cant.</th>
              <th className="px-3 py-2 font-medium text-right">Importe</th>
              <th className="px-3 py-2 font-medium">Fecha de arribo</th>
              <th className="px-3 py-2 font-medium text-center">¿Cliente lo quiere?</th>
            </tr>
          </thead>
          <tbody>
            {g.items.map((it) => {
              const c = ctrl[keyOf(it)] ?? { fechaArribo: null, clienteQuiere: null };
              return (
                <tr key={keyOf(it)} className="border-t border-zinc-800/70">
                  <td className="px-3 py-2 font-mono text-zinc-400 whitespace-nowrap">{it.NroRengOrigen}</td>
                  <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">{it.CodArticulo}</td>
                  <td className="px-3 py-2 text-zinc-100">{it.Nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(it.CantPend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-300">${fmtNum(it.Importe)}</td>
                  <td className="px-3 py-2">
                    <div className="relative">
                      <CalendarDays size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                      <input
                        type="date"
                        value={c.fechaArribo ?? ""}
                        onChange={(e) => onSave(it, { fechaArribo: e.target.value || null })}
                        className="bg-[#111] border border-zinc-700 rounded-md pl-7 pr-2 py-1 text-sm text-zinc-100 focus:border-yellow-400 outline-none [color-scheme:dark]"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() =>
                          onSave(it, { clienteQuiere: c.clienteQuiere === true ? null : true })
                        }
                        title="Lo quiere"
                        className={`px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1 ${
                          c.clienteQuiere === true
                            ? "bg-green-600 border-green-600 text-white"
                            : "border-zinc-700 text-green-500 hover:bg-green-600/20"
                        }`}
                      >
                        <Check size={13} /> Sí
                      </button>
                      <button
                        onClick={() =>
                          onSave(it, { clienteQuiere: c.clienteQuiere === false ? null : false })
                        }
                        title="No lo quiere"
                        className={`px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1 ${
                          c.clienteQuiere === false
                            ? "bg-red-600 border-red-600 text-white"
                            : "border-zinc-700 text-red-500 hover:bg-red-600/20"
                        }`}
                      >
                        <X size={13} /> No
                      </button>
                    </div>
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

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-100 truncate">{value}</div>
    </div>
  );
}
