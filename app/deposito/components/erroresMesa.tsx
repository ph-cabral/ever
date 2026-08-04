"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertTriangle, RefreshCw, FileSpreadsheet } from "lucide-react";
import { PageTitle, Panel, KPI, Grid, Table, ChartBar, ChartLine, C, fmtNum, fmtDate } from "./ui";
import { exportarErroresMesa } from "@/lib/deposito/exportErroresMesa";

// ──────────────────────────────────────────────────────────────────────────────
// Registro de Errores — Mesa de Control + Calidad (deposito.errores_mesa,
// origen distingue el widget). El alta se hace desde los widgets de
// escritorio (errores-mesa-widget.ps1 / errores-calidad-widget.ps1); esta
// vista es solo lectura + filtros. Fuente: GET /api/deposito/errores-mesa
// (→ indicadores-api, fetch_errores_mesa_list en errores_mesa.py).
//
// A pedido de Pablo, 2026-07-21 (varias vueltas de cambios el mismo día,
// ver errores_mesa.py para el detalle de cada una):
//   · Registrada = quién HIZO EL REGISTRO (N° ingresado al abrir el
//     widget) → columna `registradoPor` para los 2 orígenes (antes, en
//     Mesa de Control, este dato vivía en `controlador`; se movió en la
//     2da vuelta). Fallback a `controlador` SOLO para filas de Mesa de
//     Control insertadas ANTES de ese cambio (`registradoPor` NULL ahí, el
//     dato sigue en `controlador`) — no aplica a Calidad, que siempre tuvo
//     `registradoPor` poblado.
//   · Controlador = controlador real del pedido según Magnus
//     (Ven_PedImpresoCP.CodControlador1/2) → `nombreControladorReal`.
//     SOLO para origen='calidad' (ver insert_error_calidad) — la 3ra vuelta
//     lo había resuelto también para Mesa de Control, pero se REVIRTIÓ:
//     quien carga el widget de Mesa de Control YA ES el controlador, y
//     Magnus puede traer un controlador previo/distinto para el mismo
//     pedido, mostrando 2 nombres distintos para lo mismo (caso real:
//     Registrada=Pablo Cabral, Controlador=Mollina Facundo). Para Mesa de
//     Control esta columna debe verse vacía ("—"); las filas que quedaron
//     con este dato de más (día de la 3ra vuelta) se limpian con
//     ever/sql/deposito_errores_mesa_revertir_controlador_mesa.sql. Sin
//     fallback para Calidad: las filas viejas sin este dato necesitan
//     re-consultar Magnus, no alcanza con lo que ya está en la fila — ver
//     backfill_controlador_real.py.
//   · Operario = el operario/preparador de Magnus (WMS OT + Personal,
//     `nombreArmador`) sobre el que es el error, unificado para los 2
//     orígenes desde la 1ra vuelta (esto no se tocó).
//
// Artículos (columna nueva, a pedido de Pablo, mismo día): selector
// multiple-choice agregado en los 2 widgets — solo muestra los artículos
// que están en el pedido (WMS OTItem de la OT de Picking, ver
// fetch_articulos_pedido en errores_mesa.py). Se guarda ya formateado
// ("código - descripción") en la columna `articulos` (text[], opcional, no
// bloquea el alta en ningún widget si no se elige nada).
// ──────────────────────────────────────────────────────────────────────────────

export interface ErrorMesaRow {
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
  nroControladorReal: number | null;
  nombreControladorReal: string | null;
  observacion: string | null;
  articulos: string[] | null;
  createdAt: string;
}

// Quién hizo el registro (N° ingresado al abrir el widget). Exportada para
// reuso en lib/deposito/exportErroresMesa.ts (mismo criterio en pantalla y
// en el Excel exportado). Fallback a `controlador` solo para filas viejas
// de Mesa de Control (de antes del cambio del 2026-07-21 que movió este
// dato a `registradoPor`) — en Calidad `registradoPor` siempre estuvo
// poblado, así que ahí el fallback nunca debería activarse.
export function getRegistrador(r: ErrorMesaRow): string | null {
  return r.registradoPor ?? (r.origen === "calidad" ? null : r.controlador);
}
// Operario/preparador de Magnus (WMS) sobre el que es el error — mismo
// campo para los 2 orígenes desde 2026-07-21.
export function getOperario(r: ErrorMesaRow): string | null {
  return r.nombreArmador;
}

const ALL = "__all__";

// Celda editable de la columna "Observación" (última): nota libre, editable
// desde acá (no desde el widget de escritorio). Guarda al perder foco o con
// Enter, solo si el valor cambió. PATCH /api/deposito/errores-mesa/[id].
function ObservacionCell({
  row,
  onSave,
}: {
  row: ErrorMesaRow;
  onSave: (id: number, observacion: string) => Promise<void>;
}) {
  const [value, setValue] = useState(row.observacion ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(row.observacion ?? ""), [row.observacion]);

  const commit = async () => {
    const trimmed = value.trim();
    if (trimmed === (row.observacion ?? "")) return;
    setSaving(true);
    try {
      await onSave(row.id, trimmed);
    } catch (e) {
      console.error("PATCH observacion", e);
      setValue(row.observacion ?? ""); // revierte: no se pudo guardar
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      disabled={saving}
      placeholder="Agregar nota…"
      className="w-full min-w-[160px] bg-transparent border border-transparent hover:border-zinc-700 focus:border-yellow-400 rounded px-1.5 py-1 text-zinc-100 outline-none text-[12px] disabled:opacity-50"
    />
  );
}

export function ErroresMesaTab() {
  const [rows, setRows] = useState<ErrorMesaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [controlador, setControlador] = useState(ALL);
  const [preparador, setPreparador] = useState(ALL);
  const [agruparPor, setAgruparPor] = useState<"operario" | "registrada">("operario");

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

  const saveObservacion = useCallback(async (id: number, observacion: string) => {
    const res = await fetch(`/api/deposito/errores-mesa/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observacion }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `HTTP ${res.status}`);
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, observacion } : r)));
  }, []);

  const motivoTop = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) =>
      m.set(r.detalleError, (m.get(r.detalleError) ?? 0) + 1),
    );
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [filtered]);

  // ── Errores por persona (Operario que cometió el error / Registrada que lo
  // cargó, a elección) — top 20, respeta desde/hasta + los filtros activos.
  const porPersona = useMemo(() => {
    const getter = agruparPor === "operario" ? getOperario : getRegistrador;
    const m = new Map<string, number>();
    filtered.forEach((r) => {
      const p = getter(r);
      if (p) m.set(p, (m.get(p) ?? 0) + 1);
    });
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([persona, cantidad]) => ({ persona, cantidad }));
  }, [filtered, agruparPor]);

  // ── Tendencia de errores en el tiempo (por día, fecha del pedido) — mismo
  // rango/filtros que el resto de la vista.
  const tendencia = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => {
      if (!r.fecha) return;
      m.set(r.fecha, (m.get(r.fecha) ?? 0) + 1);
    });
    return [...m.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([fecha, cantidad]) => ({ fecha: fmtDate(fecha), cantidad }));
  }, [filtered]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle
          title="Registro de Errores — Mesa de Control    _    PR-CAL008-R3"
          sub="Altas desde el widget de escritorio · deposito.errores_mesa"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarErroresMesa(filtered, { desde, hasta })}
            disabled={!filtered.length}
            title="Exportar a Excel lo que se ve en la tabla (con los filtros activos)"
            className="flex items-center gap-1.5 text-zinc-400 hover:text-yellow-400 transition-colors px-2.5 py-1.5 rounded-md border border-zinc-700 disabled:opacity-40 text-sm"
          >
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-yellow-400 transition-colors px-2.5 py-1.5 rounded-md border border-zinc-700 disabled:opacity-40 text-sm"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />{" "}
            Refrescar
          </button>
        </div>
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
            Registrada
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
            <Panel
              title="Errores por persona"
              accent={
                <button
                  onClick={() =>
                    setAgruparPor((v) => (v === "operario" ? "registrada" : "operario"))
                  }
                  className="text-[11px] font-semibold px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-yellow-400 hover:text-yellow-400 transition-colors normal-case"
                >
                  Ver por: {agruparPor === "operario" ? "Operario" : "Registrada"}
                </button>
              }
            >
              <ChartBar
                data={porPersona}
                xKey="persona"
                height={260}
                series={[{ key: "cantidad", name: "Errores", color: C.brand }]}
                fmt={(n) => fmtNum(n)}
                angle={-35}
                showValues
              />
              {porPersona.length === 20 && (
                <p className="text-[11px] text-zinc-600 mt-2">
                  Mostrando las 20 personas con más errores.
                </p>
              )}
            </Panel>

            <Panel title="Tendencia de errores" accent={`(${fmtNum(filtered.length)} en el rango)`}>
              <ChartLine
                data={tendencia}
                xKey="fecha"
                height={260}
                series={[{ key: "cantidad", name: "Errores", color: C.red }]}
                fmt={(n) => fmtNum(n)}
              />
            </Panel>
          </div>

          <Grid cols={4}>
            <KPI
              label="Registros"
              value={fmtNum(filtered.length)}
              accent="yellow"
            />
            <KPI
              label="Registradas"
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
                {
                  key: "fecha",
                  label: "Fecha",
                  render: (r) => fmtDate(r.fecha),
                },
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
                  label: "Registrada",
                  render: (r) => getRegistrador(r) ?? "—",
                },
                {
                  key: "controladorReal",
                  label: "Controlador",
                  render: (r) => r.nombreControladorReal ?? "—",
                },
                {
                  key: "operario",
                  label: "Operario",
                  render: (r) => getOperario(r) ?? "—",
                },
                { key: "detalleError", label: "Detalle Error" },
                {
                  key: "articulos",
                  label: "Artículos",
                  render: (r) => (r.articulos?.length ? r.articulos.join(", ") : "—"),
                },
                {
                  key: "observacion",
                  label: "Observación",
                  render: (r) => (
                    <ObservacionCell row={r} onSave={saveObservacion} />
                  ),
                },
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
