"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertTriangle, RefreshCw, ClipboardList } from "lucide-react";
import {
  PageTitle,
  SectionTitle,
  Panel,
  KPI,
  Grid,
  ChartBar,
  ChartDonut,
  PALETTE,
  fmtNum,
  fmtMes,
} from "./ui";

// ──────────────────────────────────────────────────────────────────────────────
// Mesas de Control — productividad por Controlador (items controlados),
// fuente: EVERWEAR.dbo.RPT_V325_ProductividadPorControlador vía
// /api/deposito/mesa-control (→ indicadores-api → SP en vivo). Solo lectura.
// Selección de meses por checkbox (no un rango de fechas): el SP se corre una
// vez por mes elegido para poder comparar meses entre sí.
// ──────────────────────────────────────────────────────────────────────────────

interface PorMes {
  mes: string;
  total: number;
}
interface PorControlador {
  controlador: string;
  codigo: number | string | null;
  por_mes: Record<string, number>;
  total: number;
}
interface MesaControlData {
  meses: string[];
  columnas_detectadas: Record<string, string | null> | null;
  por_mes: PorMes[];
  por_controlador: PorControlador[];
  total_general: number;
}

const isoMes = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// Últimos N meses (más reciente primero), para el selector.
function ultimosMeses(n: number): string[] {
  const out: string[] = [];
  const hoy = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    out.push(isoMes(d));
  }
  return out;
}

export function MesaControlTab() {
  const disponibles = useMemo(() => ultimosMeses(12), []);
  const [seleccionados, setSeleccionados] = useState<string[]>(() =>
    ultimosMeses(3).reverse(), // cronológico ascendente
  );
  const [data, setData] = useState<MesaControlData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false); // toggle carta por controlador

  const load = useCallback(async (meses: string[]) => {
    if (!meses.length) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/deposito/mesa-control?meses=${meses.join(",")}`,
        { cache: "no-store" },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j as MesaControlData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(seleccionados);
    // Sólo en el montaje: los cambios posteriores los dispara toggleMes().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMes = (m: string) => {
    const next = seleccionados.includes(m)
      ? seleccionados.filter((x) => x !== m)
      : [...seleccionados, m];
    const ordenados = disponibles.filter((x) => next.includes(x)).reverse(); // cronológico
    setSeleccionados(ordenados);
    load(ordenados);
  };

  const mesesOrdenados = data?.meses ?? []; // ya viene ascendente desde el back
  const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1] ?? null;
  const ult2 = mesesOrdenados.slice(-2);

  // Pie: comparación de los últimos 2 meses seleccionados.
  const pieData = ult2.map((m, i) => ({
    name: fmtMes(m),
    value: data?.por_mes.find((p) => p.mes === m)?.total ?? 0,
    color: PALETTE[i % PALETTE.length],
  }));

  // Barras: 1 barra por mes, todos los meses seleccionados.
  const barMesData = (data?.por_mes ?? []).map((p) => ({
    mes: fmtMes(p.mes),
    total: p.total,
  }));

  // Barras por controlador: último mes o suma de todos los seleccionados (toggle).
  const barControladorData = (data?.por_controlador ?? [])
    .map((c) => ({
      controlador:
        c.controlador.length > 16 ? c.controlador.slice(0, 16) + "…" : c.controlador,
      cantidad: verTodos ? c.total : ultimoMes ? (c.por_mes[ultimoMes] ?? 0) : 0,
    }))
    .filter((c) => c.cantidad > 0)
    .sort((a, b) => b.cantidad - a.cantidad);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle
          title="Mesas de Control"
          sub="Items controlados por Controlador — SP RPT_V325_ProductividadPorControlador (EVERWEAR)"
        />
        <button
          onClick={() => load(seleccionados)}
          disabled={loading}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-yellow-400 transition-colors px-2.5 py-1.5 rounded-md border border-zinc-700 disabled:opacity-40 text-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refrescar
        </button>
      </div>

      {/* Selector de meses */}
      <Panel title="Meses a comparar" accent="(elegí uno o más)" className="mb-5">
        <div className="flex flex-wrap gap-2">
          {disponibles.map((m) => {
            const activo = seleccionados.includes(m);
            return (
              <button
                key={m}
                onClick={() => toggleMes(m)}
                className={`px-3 py-1.5 rounded-md border text-[12px] font-medium transition-colors ${
                  activo
                    ? "bg-yellow-400/10 border-yellow-400/50 text-yellow-400"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {fmtMes(m)}
              </button>
            );
          })}
        </div>
      </Panel>

      {error && (
        <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300 mb-5">
          <AlertTriangle size={16} className="text-red-400" /> {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Loader2 size={36} className="text-yellow-400 animate-spin" />
          <p className="text-zinc-400 font-medium">Consultando EVERWEAR…</p>
        </div>
      ) : !data || data.meses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <ClipboardList size={40} className="text-zinc-700" />
          <p className="text-zinc-400 font-medium">
            Elegí al menos un mes para ver datos.
          </p>
        </div>
      ) : (
        <>
          <Grid cols={4}>
            <KPI label="Total controlado" value={fmtNum(data.total_general)} accent="yellow" />
            <KPI label="Meses" value={fmtNum(data.meses.length)} accent="neutral" />
            <KPI
              label="Controladores"
              value={fmtNum(data.por_controlador.length)}
              accent="neutral"
            />
            <KPI
              label="Último mes"
              value={ultimoMes ? fmtMes(ultimoMes) : "—"}
              sub={
                ultimoMes
                  ? fmtNum(data.por_mes.find((p) => p.mes === ultimoMes)?.total ?? 0)
                  : undefined
              }
              accent="green"
            />
          </Grid>

          <SectionTitle>📊 Comparación de los últimos 2 meses</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel
              title="Últimos 2 meses seleccionados"
              accent={ult2.length === 2 ? `(${fmtMes(ult2[0])} vs ${fmtMes(ult2[1])})` : ""}
            >
              {ult2.length < 2 ? (
                <div className="py-10 text-center text-zinc-600 text-sm">
                  Elegí al menos 2 meses para comparar.
                </div>
              ) : (
                <ChartDonut data={pieData} height={260} fmt={(n) => fmtNum(n)} />
              )}
            </Panel>

            <Panel
              title="Total por mes"
              accent={`(${data.meses.length} ${data.meses.length === 1 ? "mes" : "meses"})`}
            >
              <ChartBar
                data={barMesData}
                xKey="mes"
                height={260}
                series={[{ key: "total", name: "Items controlados", color: PALETTE[0] }]}
                fmt={(n) => fmtNum(n)}
                showValues
              />
            </Panel>
          </div>

          <SectionTitle>👷 Por Controlador</SectionTitle>
          <Panel
            title={
              verTodos ? "Todos los meses seleccionados" : `Último mes (${ultimoMes ? fmtMes(ultimoMes) : "—"})`
            }
            accent={
              <button
                onClick={() => setVerTodos((v) => !v)}
                className="text-[11px] font-semibold px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-yellow-400 hover:text-yellow-400 transition-colors normal-case"
              >
                {verTodos ? "Ver solo último mes" : "Ver todos los meses"}
              </button>
            }
          >
            <ChartBar
              data={barControladorData}
              xKey="controlador"
              height={320}
              series={[{ key: "cantidad", name: "Items controlados", color: PALETTE[1] }]}
              fmt={(n) => fmtNum(n)}
              angle={-35}
              showValues
            />
          </Panel>

          <p className="text-[11px] text-zinc-600 mt-6 leading-relaxed">
            Fuente: EVERWEAR.dbo.RPT_V325_ProductividadPorControlador (agrupa por
            Centro de Preparación + Controlador, fecha de CIERRE de pedido en CP).
            Lectura en vivo, solo lectura — no se escribe en Magnus. Las columnas
            de Centro/Controlador se detectan por nombre; si algo no coincide,
            confirmar con GET /deposito/mesa-control/diag.
          </p>
        </>
      )}
    </div>
  );
}
