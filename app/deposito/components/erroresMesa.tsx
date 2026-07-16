"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { PageTitle, Panel, KPI, Grid, Table, fmtNum, fmtDate } from "./ui";

// ──────────────────────────────────────────────────────────────────────────────
// Registro de Errores — Mesa de Control + Calidad (deposito.errores_mesa,
// origen distingue el widget). El alta se hace desde los widgets de
// escritorio (errores-mesa-widget.ps1 / errores-calidad-widget.ps1); esta
// vista es solo lectura + filtros. Fuente: GET /api/deposito/errores-mesa
// (→ indicadores-api, fetch_errores_mesa_list en errores_mesa.py).
//
// A pedido de Pablo (2026-07-16), 2 columnas con significado distinto según
// origen (mismo dato de fondo, dos roles distintos):
//   · Controlador = quién HIZO EL REGISTRO (N° ingresado al abrir el
//     widget) → mesa_control: columna `controlador` (self-identificado);
//     calidad: columna `registradoPor` (resuelto por N°, WMS.Personal).
//   · Operario = sobre quién es el error → mesa_control: `nombreArmador`
//     (preparador, WMS); calidad: `controlador` (controlador real del
//     pedido, resuelto solo por Magnus — NO lo tipea nadie).
// ──────────────────────────────────────────────────────────────────────────────

interface ErrorMesaRow {
  id: number;
  nroPedido: number;
  fecha: string | null;
  tipoPedido: string | null;
  ot: number | null;
  controlador: string;
  nombreArmador: string | null;
  ubicacion: string | null;
  detalleError: string;
  origen: string;
  registradoPor: string | null;
  createdAt: string;
}

// Quién hizo el registro (N° ingresado al abrir el widget).
function getRegistrador(r: ErrorMesaRow): string | null {
  return r.origen === "calidad" ? r.registradoPor : r.controlador;
}
// Operario sobre el que es el error (preparador en Mesa de Control,
// controlador real del pedido —Magnus— en Calidad).
function getOperario(r: ErrorMesaRow): string | null {
  return r.origen === "calidad" ? r.controlador : r.nombreArmador;
}

const ALL = "__all__";

export function ErroresMesaTab() {
  const [rows, setRows] = useState<ErrorMesaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [controlador, setControlador] = useState(ALL);
  const [preparador, setPreparador] = useState(ALL);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (desde) qs.set("desde", desde);
      if (hasta) qs.set("hasta", hasta);
      const res = await fetch(`/api/deposito/errores-mesa?${qs.toString()}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(Array.isArray(j) ? j : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setRows([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  useEffect(() => {
    load();
    // Solo en el montaje: cambios posteriores de fecha se disparan con
    // "Aplicar fechas" para no golpear la base en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const controladores = useMemo(
    () => [...new Set(rows.map(getRegistrador).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const preparadores = useMemo(
    () => [...new Set(rows.map(getOperario).filter(Boolean) as string[])].sort(),
    [rows],
  );

  // Si el filtro elegido ya no está en el set recién traído (ej. cambió el
  // rango de fechas), volver a "Todos" — mismo patrón que Operario en page.tsx.
  useEffect(() => {
    if (controlador !== ALL && !controladores.includes(controlador)) setControlador(ALL);
  }, [controladores, controlador]);
  useEffect(() => {
    if (preparador !== ALL && !preparadores.includes(preparador)) setPreparador(ALL);
  }, [preparadores, preparador]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (controlador === ALL || getRegistrador(r) === controlador) &&
          (preparador === ALL || getOperario(r) === preparador),
      ),
    [rows, controlador, preparador],
  );

  const motivoTop = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) =>
      m.set(r.detalleError, (m.get(r.detalleError) ?? 0) + 1),
    );
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [filtered]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle
          title="Registro de Errores — Mesa de Control"
          sub="Altas desde el widget de escritorio · deposito.errores_mesa"
        />
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-yellow-400 transition-colors px-2.5 py-1.5 rounded-md border border-zinc-700 disabled:opacity-40 text-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refrescar
        </button>
      </div>

      <Panel title="Filtros" className="mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Desde
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-[#1f1f1f] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-yellow-400 outline-none cursor-pointer"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Hasta
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              className="bg-[#1f1f1f] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-yellow-400 outline-none cursor-pointer"
            />
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="text-[12px] px-3 py-[7px] rounded-lg border border-zinc-700 text-zinc-300 hover:border-yellow-400 hover:text-yellow-400 transition-colors disabled:opacity-40"
          >
            Aplicar fechas
          </button>
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Controlador
            <select
              value={controlador}
              onChange={(e) => setControlador(e.target.value)}
              className="bg-[#1f1f1f] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-yellow-400 outline-none cursor-pointer min-w-[180px]"
            >
              <option value={ALL}>Todos</option>
              {controladores.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Operario
            <select
              value={preparador}
              onChange={(e) => setPreparador(e.target.value)}
              className="bg-[#1f1f1f] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-yellow-400 outline-none cursor-pointer min-w-[180px]"
            >
              <option value={ALL}>Todos</option>
              {preparadores.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Panel>

      {error && (
        <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300 mb-5">
          <AlertTriangle size={16} className="text-red-400" /> {error}
        </div>
      )}

      {loading && !rows.length ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Loader2 size={36} className="text-yellow-400 animate-spin" />
          <p className="text-zinc-400 font-medium">Consultando…</p>
        </div>
      ) : (
        <>
          <Grid cols={4}>
            <KPI label="Registros" value={fmtNum(filtered.length)} accent="yellow" />
            <KPI
              label="Controladores"
              value={fmtNum(controladores.length)}
              accent="neutral"
            />
            <KPI
              label="Operarios"
              value={fmtNum(preparadores.length)}
              accent="neutral"
            />
            <KPI
              label="Motivo más frecuente"
              value={motivoTop ? fmtNum(motivoTop[1]) : "—"}
              sub={motivoTop ? motivoTop[0] : undefined}
              accent="amber"
            />
          </Grid>

          <div className="mt-5">
            <Table<ErrorMesaRow>
              cols={[
                { key: "fecha", label: "Fecha", render: (r) => fmtDate(r.fecha) },
                { key: "nroPedido", label: "Nro Pedido", num: true },
                {
                  key: "tipoPedido",
                  label: "Tipo Pedido",
                  render: (r) => r.tipoPedido ?? "—",
                },
                {
                  key: "ot",
                  label: "OT",
                  num: true,
                  render: (r) => (r.ot != null ? fmtNum(r.ot) : "—"),
                },
                {
                  key: "controlador",
                  label: "Controlador",
                  render: (r) => getRegistrador(r) ?? "—",
                },
                {
                  key: "operario",
                  label: "Operario",
                  render: (r) => getOperario(r) ?? "—",
                },
                { key: "detalleError", label: "Detalle Error" },
              ]}
              rows={filtered}
              max={500}
              maxH={560}
              empty="Sin registros en el rango/filtros elegidos"
            />
          </div>
        </>
      )}
    </div>
  );
}
