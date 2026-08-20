"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertTriangle, RefreshCw, ListChecks } from "lucide-react";
import {
  PageTitle,
  SectionTitle,
  Table,
  Col,
  Tag,
  PALETTE,
  fmtNum,
} from "./ui";
import { DateRangeField } from "@/components/ui/date-range-field";

// ──────────────────────────────────────────────────────────────────────────────
// Pedidos asignados — detalle de deposito.control_asignacion (Postgres):
// 1 fila por pedido ya reclamado por un operario ("asignadoEn" IS NOT NULL),
// vía /api/deposito/control-asignacion/pedidos (→ indicadores-api →
// control_asignacion.py::fetch_pedidos_asignados). Solo lectura.
//
// "Hora cierre" = próxima vez que ESE MISMO operario reclamó otro pedido
// (no hay un cierre explícito por pedido) — proxy del tiempo de control.
// Sin próxima asignación todavía → "En curso".
// ──────────────────────────────────────────────────────────────────────────────

interface PedidoAsignado {
  nroPedido: number;
  codCliente: number | null;
  cliente: string | null;
  nroOperarioAsignado: number | null;
  asignadoA: string | null;
  asignadoEn: string;
  horaCierre: string | null;
  cantidadItems: number;
}
interface PedidosAsignadosData {
  pedidos: PedidoAsignado[];
}

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR");
const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

// Duración entre 2 timestamps ISO, en "Xh Ym" / "Xm". null = "hasta" ausente
// (todavía en curso, no es un error).
function fmtDuracion(desde: string, hasta: string | null): string | null {
  if (!hasta) return null;
  const ms = new Date(hasta).getTime() - new Date(desde).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function PedidosAsignadosTab() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [data, setData] = useState<PedidosAsignadosData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hoy = isoLocal(new Date());
    setDesde(hoy);
    setHasta(hoy);
  }, []);

  const load = useCallback(async (d: string, h: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (d) qs.set("desde", d);
      if (h) qs.set("hasta", h || d);
      const res = await fetch(`/api/deposito/control-asignacion/pedidos?${qs.toString()}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j as PedidosAsignadosData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (desde && hasta) load(desde, hasta);
  }, [desde, hasta, load]);

  const pedidos = useMemo(() => data?.pedidos ?? [], [data]);

  // Color estable por operario (orden alfabético → PALETTE cíclico), para
  // detectar de un vistazo cuál hizo cada pedido.
  const colorPorOperario = useMemo(() => {
    const nombres = Array.from(
      new Set(pedidos.map((p) => p.asignadoA).filter((n): n is string => !!n)),
    ).sort();
    const m = new Map<string, string>();
    nombres.forEach((n, i) => m.set(n, PALETTE[i % PALETTE.length]));
    return m;
  }, [pedidos]);

  // Desglose: cantidad de pedidos + items controlados, por operario.
  const desglose = useMemo(() => {
    const m = new Map<string, { operario: string; pedidos: number; items: number }>();
    for (const p of pedidos) {
      const nombre = p.asignadoA || "—";
      const e = m.get(nombre) ?? { operario: nombre, pedidos: 0, items: 0 };
      e.pedidos += 1;
      e.items += p.cantidadItems || 0;
      m.set(nombre, e);
    }
    return Array.from(m.values()).sort((a, b) => b.items - a.items);
  }, [pedidos]);

  const totalItems = desglose.reduce((s, d) => s + d.items, 0);

  const cols: Col<PedidoAsignado>[] = [
    { key: "nroPedido", label: "Nº Pedido", num: true },
    { key: "codCliente", label: "Nº Cliente", num: true },
    {
      key: "cliente",
      label: "Cliente",
      render: (r) => r.cliente || "—",
    },
    { key: "fecha", label: "Fecha", render: (r) => fmtFecha(r.asignadoEn) },
    { key: "hora", label: "Hora", render: (r) => fmtHora(r.asignadoEn) },
    {
      key: "operario",
      label: "Operario",
      render: (r) => {
        const color = r.asignadoA ? colorPorOperario.get(r.asignadoA) : undefined;
        return (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ background: color || "#3f3f46" }}
            />
            {r.asignadoA || "—"}
          </span>
        );
      },
    },
    {
      key: "cantidadItems",
      label: "Items",
      num: true,
      render: (r) => fmtNum(r.cantidadItems),
    },
    {
      key: "horaCierre",
      label: "Hora cierre",
      render: (r) =>
        r.horaCierre ? (
          fmtHora(r.horaCierre)
        ) : (
          <Tag tone="amber">En curso</Tag>
        ),
    },
    {
      key: "duracion",
      label: "Duración",
      render: (r) => fmtDuracion(r.asignadoEn, r.horaCierre) ?? "—",
    },
  ];

  const desgloseCols: Col<(typeof desglose)[number]>[] = [
    {
      key: "operario",
      label: "Operario",
      render: (r) => (
        <span className="flex items-center gap-1.5 font-medium text-zinc-200">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: colorPorOperario.get(r.operario) || "#3f3f46" }}
          />
          {r.operario}
        </span>
      ),
    },
    { key: "pedidos", label: "Pedidos", num: true, render: (r) => fmtNum(r.pedidos) },
    { key: "items", label: "Items controlados", num: true, render: (r) => fmtNum(r.items) },
  ];

  return (
    <div>
      <div className="sticky top-16 z-40 -mx-8 px-8 py-3 bg-[#111111]/95 backdrop-blur border-b border-zinc-800 flex items-start justify-between gap-4 flex-wrap">
        <PageTitle
          title="Pedidos asignados"
          sub="Quién controló cada pedido y cuándo — deposito.control_asignacion"
        />
        <div className="flex items-center gap-2">
          <DateRangeField desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} align="end" />
          <button
            onClick={() => load(desde, hasta)}
            disabled={loading}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-yellow-400 transition-colors px-2.5 py-1.5 rounded-md border border-zinc-700 disabled:opacity-40 text-sm"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refrescar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300 mb-5 mt-3">
          <AlertTriangle size={16} className="text-red-400" /> {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Loader2 size={36} className="text-yellow-400 animate-spin" />
          <p className="text-zinc-400 font-medium">Consultando…</p>
        </div>
      ) : pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <ListChecks size={40} className="text-zinc-700" />
          <p className="text-zinc-400 font-medium">
            Sin pedidos asignados en el rango elegido.
          </p>
        </div>
      ) : (
        <>
          <SectionTitle>👷 Desglose por operario ({fmtNum(totalItems)} items en total)</SectionTitle>
          <Table cols={desgloseCols} rows={desglose} empty="Sin datos" />

          <SectionTitle>📋 Detalle por pedido ({fmtNum(pedidos.length)})</SectionTitle>
          <Table cols={cols} rows={pedidos} maxH={560} />

          <p className="text-[11px] text-zinc-600 mt-4 leading-relaxed">
            "Hora cierre" no es un cierre explícito del pedido (el widget no
            tiene un botón para eso): es el momento en que ESE MISMO operario
            reclamó su próximo pedido — se usa como aproximación del tiempo
            de control. "En curso" = todavía no reclamó uno nuevo. Items =
            renglones del pedido (Magnus venfer_pedidoReng, mismo origen que
            "Resumen"). Solo lectura.
          </p>
        </>
      )}
    </div>
  );
}
