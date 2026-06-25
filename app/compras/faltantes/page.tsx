"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, ChevronDown, ChevronRight, PackageCheck,
  CheckSquare, Square, ArrowDownWideNarrow,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/faltantes — items "sin existencia" (preparado.faltante_existencia,
//   existencia=false; mismo universo que /deposito/faltantes/control) para que
//   el sector compras decida qué encargar.
//   Siempre ordenado por Importe (desc). Checks arriba permiten agrupar
//   (combinables) por Cliente, Pedido y/o Fecha de arribo. Sin checks → lista
//   plana. Solo lectura: la edición de fecha de arribo / "¿lo quiere?" se hace
//   en /deposito/faltantes/control.
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
}
interface Ctrl {
  fechaArribo: string | null;
  clienteQuiere: boolean | null;
}
interface Mark {
  nroPedOrigen: number;
  nroRengOrigen: number;
  existencia: boolean;
}
type CtrlRow = Ctrl & { nroPedOrigen: number; nroRengOrigen: number };

type GroupKey = "cliente" | "pedido" | "fecha";
const GROUP_ORDER: GroupKey[] = ["cliente", "pedido", "fecha"];
const GROUP_LABELS: Record<GroupKey, string> = {
  cliente: "Cliente",
  pedido: "Pedido",
  fecha: "Fecha de arribo",
};

interface Node {
  path: string;
  label: string;
  items: Item[];
  importe: number;
  children: Node[] | null; // null = nodo hoja (tabla de artículos)
}

const keyOf = (it: { NroPedOrigen: number; NroRengOrigen: number }) =>
  `${it.NroPedOrigen}-${it.NroRengOrigen}`;
const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtAr = (s: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};
const sumImporte = (items: Item[]) =>
  items.reduce((acc, it) => acc + (it.Importe || 0), 0);
const byImporteDesc = (a: Item, b: Item) => (b.Importe || 0) - (a.Importe || 0);

function groupValue(k: GroupKey, it: Item, ctrl: Record<string, Ctrl>): string {
  if (k === "cliente") return it.Cliente != null ? String(it.Cliente) : "Sin cliente";
  if (k === "pedido") return String(it.NroPedOrigen);
  const f = ctrl[keyOf(it)]?.fechaArribo ?? null;
  return f ? fmtAr(f) : "Sin fecha de arribo";
}

function buildTree(
  items: Item[],
  keys: GroupKey[],
  ctrl: Record<string, Ctrl>,
  pathPrefix = "",
): Node[] {
  if (keys.length === 0) {
    return [
      {
        path: pathPrefix || "_flat",
        label: "",
        items: [...items].sort(byImporteDesc),
        importe: sumImporte(items),
        children: null,
      },
    ];
  }
  const [head, ...rest] = keys;
  const byVal = new Map<string, Item[]>();
  for (const it of items) {
    const v = groupValue(head, it, ctrl);
    const arr = byVal.get(v);
    if (arr) arr.push(it);
    else byVal.set(v, [it]);
  }
  const nodes: Node[] = [...byVal.entries()].map(([v, its]) => {
    const path = `${pathPrefix}/${head}:${v}`;
    return {
      path,
      label: v,
      items: its,
      importe: sumImporte(its),
      children: rest.length ? buildTree(its, rest, ctrl, path) : null,
    };
  });
  nodes.sort((a, b) => b.importe - a.importe);
  if (!rest.length) for (const n of nodes) n.items.sort(byImporteDesc);
  return nodes;
}

export default function EncargarFaltantesPage() {
  const [base, setBase] = useState<Item[]>([]);
  const [fecha, setFecha] = useState("");
  const [ctrl, setCtrl] = useState<Record<string, Ctrl>>({});
  const [groupBy, setGroupBy] = useState<GroupKey[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
          for (const r of (kj.rows ?? []) as CtrlRow[])
            ctrlMap[`${r.nroPedOrigen}-${r.nroRengOrigen}`] = {
              fechaArribo: r.fechaArribo ?? null,
              clienteQuiere: r.clienteQuiere ?? null,
            };
        }
      }

      // Solo "sin existencia" (preparado.faltante_existencia, existencia=false)
      const sinExistencia = rows.filter((r) => sin.has(keyOf(r)));
      setCtrl(ctrlMap);
      setBase(sinExistencia);
      setOpen({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setBase([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleGroup = (k: GroupKey) =>
    setGroupBy((g) => (g.includes(k) ? g.filter((x) => x !== k) : [...g, k]));

  const activeKeys = useMemo(
    () => GROUP_ORDER.filter((k) => groupBy.includes(k)),
    [groupBy],
  );

  const tree = useMemo(
    () => buildTree(base, activeKeys, ctrl),
    [base, activeKeys, ctrl],
  );

  const tot = useMemo(
    () => ({ art: base.length, imp: sumImporte(base) }),
    [base],
  );

  const hay = base.length > 0;

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
            <b className="text-zinc-200">${fmtNum(tot.imp)}</b>
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
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="flex items-center gap-1.5 text-xs text-zinc-500 mr-1">
            <ArrowDownWideNarrow size={14} /> Ordenado por importe
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-xs text-zinc-500 mr-1">Agrupar por:</span>
          {GROUP_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => toggleGroup(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                groupBy.includes(k)
                  ? "bg-yellow-400/15 border-yellow-400 text-yellow-300"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {groupBy.includes(k) ? <CheckSquare size={14} /> : <Square size={14} />}
              {GROUP_LABELS[k]}
            </button>
          ))}
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
        ) : activeKeys.length === 0 ? (
          <ItemsTable items={tree[0].items} />
        ) : (
          <div className="flex flex-col gap-2">
            {tree.map((n) => (
              <GroupNode
                key={n.path}
                node={n}
                depth={0}
                open={open}
                onToggle={(p) => setOpen((o) => ({ ...o, [p]: !o[p] }))}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function GroupNode({
  node, depth, open, onToggle,
}: {
  node: Node;
  depth: number;
  open: Record<string, boolean>;
  onToggle: (path: string) => void;
}) {
  const abierto = !!open[node.path];
  return (
    <div
      className="rounded-xl border border-zinc-800 bg-[#161616] overflow-hidden"
      style={depth > 0 ? { marginLeft: depth * 16 } : undefined}
    >
      <button
        onClick={() => onToggle(node.path)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-900/50 transition-colors"
      >
        {abierto ? (
          <ChevronDown size={16} className="shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight size={16} className="shrink-0 text-zinc-500" />
        )}
        <span className="flex-1 text-sm font-medium text-zinc-100 truncate">
          {node.label}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">
          {node.items.length} art.
        </span>
        <span className="shrink-0 text-sm tabular-nums text-zinc-200 w-24 text-right">
          ${fmtNum(node.importe)}
        </span>
      </button>

      {abierto && (
        <div className="border-t border-zinc-800 px-2 py-2 flex flex-col gap-2">
          {node.children
            ? node.children.map((c) => (
                <GroupNode key={c.path} node={c} depth={depth + 1} open={open} onToggle={onToggle} />
              ))
            : <ItemsTable items={node.items} />}
        </div>
      )}
    </div>
  );
}

function ItemsTable({ items }: { items: Item[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-[#1A1A1A] text-zinc-400">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Cód.</th>
            <th className="px-3 py-2 font-medium">Artículo</th>
            <th className="px-3 py-2 font-medium text-right">Cant.</th>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Pedido</th>
            <th className="px-3 py-2 font-medium">Proveedor</th>
            <th className="px-3 py-2 font-medium text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={keyOf(it)} className="border-t border-zinc-800/70">
              <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">{it.CodArticulo}</td>
              <td className="px-3 py-2 text-zinc-100">{it.Nombre}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNum(it.CantPend)}</td>
              <td className="px-3 py-2 text-zinc-300">{it.Cliente ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-yellow-400/90">{it.NroPedOrigen}</td>
              <td className="px-3 py-2 text-zinc-400">{it.Proveedor || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-300">${fmtNum(it.Importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
