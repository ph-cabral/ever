"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Pause,
  Play,
  ChevronDown,
} from "lucide-react";
import {
  PageTitle,
  SectionTitle,
  Panel,
  KPI,
  Grid,
  Table,
  ChartBar,
  Tag,
  fmtNum,
  C,
  type Col,
} from "../components/ui";

// ──────────────────────────────────────────────────────────────────────────────
// Depósito EN VIVO — pedidos (OT de Picking) en espera, en proceso y carga por
// operario AHORA. Lee /api/deposito/vivo (→ indicadores-api → WMS) y se refresca
// solo cada 60 s. Los datos se leen en vivo del WMS; nunca se escribe.
// ──────────────────────────────────────────────────────────────────────────────

const REFRESH_MS = 60_000;

interface OperarioRow {
  operario: string;
  en_espera: number;
  en_proceso: number;
  total: number;
}
interface EstadoDiag {
  estado: number;
  sin_ejecucion: number;
  cantidad: number;
}
interface VivoData {
  generado_en: string;
  en_espera: number;
  en_proceso: number;
  operarios_activos: number;
  sin_asignar: { en_espera: number; en_proceso: number };
  por_operario: OperarioRow[];
  config?: {
    procesos: number[];
    estados_en_espera: number[];
    estados_en_proceso: number[];
  };
  diagnostico?: { por_estado: EstadoDiag[] };
}

const clip = (s: string, n = 22) => (s.length > n ? s.slice(0, n) + "…" : s);
const hhmmss = (d: Date) => d.toLocaleTimeString("es-AR");

export default function DepositoVivoPage() {
  const [data, setData] = useState<VivoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [auto, setAuto] = useState(true);
  const [showDiag, setShowDiag] = useState(false);
  const [, setTick] = useState(0); // re-render del "hace Xs"

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/deposito/vivo", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as VivoData & {
        error?: string;
      };
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
      setLastFetch(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  // Primera carga
  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh cada minuto (si está activado)
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [auto, load]);

  // Ticker de 1 s para "actualizado hace Xs"
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const secsAgo = lastFetch
    ? Math.floor((Date.now() - lastFetch.getTime()) / 1000)
    : null;

  const chartData = useMemo(
    () =>
      (data?.por_operario ?? []).map((o) => ({
        op: clip(o.operario),
        en_proceso: o.en_proceso,
        en_espera: o.en_espera,
      })),
    [data],
  );

  const totalVivos = (data?.en_espera ?? 0) + (data?.en_proceso ?? 0);
  const sinAsignarEspera = data?.sin_asignar?.en_espera ?? 0;

  const espSet = new Set(data?.config?.estados_en_espera ?? []);
  const procSet = new Set(data?.config?.estados_en_proceso ?? []);

  const opCols: Col<OperarioRow>[] = [
    { key: "operario", label: "Operario" },
    {
      key: "en_proceso",
      label: "En proceso",
      num: true,
      render: (r) => fmtNum(r.en_proceso),
    },
    {
      key: "en_espera",
      label: "En espera",
      num: true,
      render: (r) => fmtNum(r.en_espera),
    },
    { key: "total", label: "Total", num: true, render: (r) => fmtNum(r.total) },
  ];

  const primeraCarga = data === null;

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {/* Toasts */}
      {(loading || error) && (
        <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2">
          {loading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" />{" "}
              Actualizando…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300">
              <AlertTriangle size={16} className="text-red-400" /> {error}
            </div>
          )}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <PageTitle
            title="Depósito en vivo"
            sub="Pedidos en espera, en proceso y carga por operario · se actualiza solo cada minuto"
          />
          <div className="flex items-center gap-3 flex-wrap mt-1 text-sm">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="relative flex h-2.5 w-2.5">
                {auto && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400/70" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    auto ? "bg-green-400" : "bg-zinc-500"
                  }`}
                />
              </span>
              EN VIVO
            </span>
            <span className="text-zinc-500 tabular-nums">
              {secsAgo === null
                ? "—"
                : secsAgo < 2
                  ? "actualizado recién"
                  : `actualizado hace ${secsAgo}s`}
              {data && (
                <span className="text-zinc-600">
                  {" "}
                  · {hhmmss(new Date(data.generado_en))}
                </span>
              )}
            </span>
            <button
              onClick={() => setAuto((a) => !a)}
              title={auto ? "Pausar actualización" : "Reanudar actualización"}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-yellow-400 transition-colors px-2 py-1.5 rounded-lg border border-zinc-700"
            >
              {auto ? <Pause size={14} /> : <Play size={14} />}
              {auto ? "Pausar" : "Reanudar"}
            </button>
            <button
              onClick={load}
              title="Actualizar ahora"
              disabled={loading}
              className="text-zinc-400 hover:text-yellow-400 transition-colors p-2 disabled:opacity-40"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {primeraCarga ? (
          <div className="flex flex-col items-center justify-center py-28 gap-3 text-center">
            {loading ? (
              <>
                <Loader2 size={40} className="text-yellow-400 animate-spin" />
                <p className="text-zinc-400 font-medium">Consultando el WMS…</p>
              </>
            ) : (
              <>
                <AlertTriangle size={44} className="text-zinc-700" />
                <p className="text-zinc-400 font-medium">
                  No se pudo leer el estado en vivo
                </p>
                <p className="text-zinc-600 text-sm max-w-md">
                  {error ?? "El servicio de depósito no respondió."} Verificá
                  que la API de indicadores esté publicada y reintentá.
                </p>
                <button
                  onClick={load}
                  className="mt-2 flex items-center gap-2 bg-yellow-400 text-black font-semibold rounded-lg px-4 py-2 text-sm hover:bg-yellow-300"
                >
                  <RefreshCw size={15} /> Reintentar
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* KPIs */}
            <Grid cols={4}>
              <KPI
                label="En espera"
                value={fmtNum(data!.en_espera)}
                sub={`de ${fmtNum(totalVivos)} pedidos vivos`}
                accent={data!.en_espera > 0 ? "amber" : "neutral"}
              />
              <KPI
                label="En proceso"
                value={fmtNum(data!.en_proceso)}
                accent="green"
              />
              <KPI
                label="Operarios activos"
                value={fmtNum(data!.operarios_activos)}
                sub="con pedidos en proceso"
                accent="yellow"
              />
              <KPI
                label="Sin asignar"
                value={fmtNum(sinAsignarEspera)}
                sub="en espera, sin operario"
                accent={sinAsignarEspera > 0 ? "red" : "neutral"}
              />
            </Grid>

            {/* Carga por operario */}
            <SectionTitle>
              Carga por operario ·{" "}
              <span className="text-yellow-400 font-bold">
                {fmtNum(data!.en_proceso)}
              </span>{" "}
              en proceso ahora
            </SectionTitle>
            <Panel>
              {chartData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-zinc-600 text-sm">
                  Ningún operario con pedidos en este momento
                </div>
              ) : (
                <ChartBar
                  data={chartData}
                  xKey="op"
                  height={Math.max(200, chartData.length * 42)}
                  horizontal
                  fmt={(n) => fmtNum(n)}
                  series={[
                    {
                      key: "en_proceso",
                      name: "En proceso",
                      color: C.green,
                      stackId: "x",
                    },
                    {
                      key: "en_espera",
                      name: "En espera",
                      color: C.brand,
                      stackId: "x",
                    },
                  ]}
                />
              )}
            </Panel>

            <SectionTitle>Detalle por operario</SectionTitle>
            <Table<OperarioRow>
              cols={opCols}
              rows={data!.por_operario}
              max={100}
              maxH={460}
            />

            {/* Diagnóstico de estados (para confirmar/ajustar el mapeo de OTEstado) */}
            {data!.diagnostico?.por_estado?.length ? (
              <div className="mt-6">
                <button
                  onClick={() => setShowDiag((s) => !s)}
                  className="flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${showDiag ? "rotate-180" : ""}`}
                  />
                  Diagnóstico de estados (WMS)
                </button>
                {showDiag && (
                  <div className="mt-3">
                    <p className="text-[11px] text-zinc-600 mb-2 leading-relaxed max-w-2xl">
                      Conteo de OT de Picking sin ejecutar o ejecutadas en las
                      últimas 48 h, por{" "}
                      <code className="text-zinc-400">OTEstado</code>. Sirve
                      para confirmar qué código es cada cosa. Si algún estado
                      “en espera/en proceso” no coincide, se ajusta en{" "}
                      <code className="text-zinc-400">
                        indicadores-api/deposito.py
                      </code>{" "}
                      (ESTADOS_EN_ESPERA / ESTADOS_EN_PROCESO).
                    </p>
                    <Table<EstadoDiag>
                      cols={[
                        {
                          key: "estado",
                          label: "OTEstado",
                          render: (r) => (
                            <span className="flex items-center gap-2">
                              <span className="tabular-nums">{r.estado}</span>
                              {espSet.has(r.estado) && (
                                <Tag tone="amber">en espera</Tag>
                              )}
                              {procSet.has(r.estado) && (
                                <Tag tone="green">en proceso</Tag>
                              )}
                              {!espSet.has(r.estado) &&
                                !procSet.has(r.estado) && (
                                  <Tag tone="neutral">terminada / otro</Tag>
                                )}
                            </span>
                          ),
                        },
                        {
                          key: "cantidad",
                          label: "Cantidad",
                          num: true,
                          render: (r) => fmtNum(r.cantidad),
                        },
                        {
                          key: "sin_ejecucion",
                          label: "Sin ejecución",
                          num: true,
                          render: (r) => fmtNum(r.sin_ejecucion),
                        },
                      ]}
                      rows={data!.diagnostico!.por_estado}
                      max={50}
                    />
                  </div>
                )}
              </div>
            ) : null}

            <p className="text-[11px] text-zinc-600 mt-6 leading-relaxed">
              Pedidos = OT de Picking del WMS, leídas en vivo. En espera = OT
              generada/pendiente sin arrancar; En proceso = OT arrancada sin
              cerrar; el operario es el repositor asignado. Lectura no
              bloqueante (READ UNCOMMITTED); no se escribe en el WMS. Refresco
              automático cada 60 s.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const url = `${process.env.INDICADORES_API_URL}/deposito/resumen-ot${qs ? `?${qs}` : ""}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
// function ResumenOt() {
//   const [desde, setDesde] = useState("");
//   const [hasta, setHasta] = useState("");
//   const [data, setData] = useState<any>(null);
//   const [loading, setLoading] = useState(false);

//   const cargar = async () => {
//     setLoading(true);
//     const qs = new URLSearchParams();
//     if (desde) qs.set("desde", desde);
//     if (hasta) qs.set("hasta", hasta);
//     const res = await fetch(`/api/deposito/resumen-ot?${qs.toString()}`);
//     setData(await res.json());
//     setLoading(false);
//   };

//   useEffect(() => {
//     cargar();
//   }, []);

//   return (
//     <div className="space-y-4">
//       <div className="flex gap-2 items-end">
//         <label className="text-sm">
//           Desde
//           <input
//             type="date"
//             value={desde}
//             onChange={(e) => setDesde(e.target.value)}
//             className="border rounded px-2 py-1 ml-2"
//           />
//         </label>
//         <label className="text-sm">
//           Hasta
//           <input
//             type="date"
//             value={hasta}
//             onChange={(e) => setHasta(e.target.value)}
//             className="border rounded px-2 py-1 ml-2"
//           />
//         </label>
//         <button onClick={cargar} className="border rounded px-3 py-1 text-sm">
//           {loading ? "Cargando..." : "Filtrar"}
//         </button>
//       </div>

//       {data && (
//         <>
//           <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
//             <KpiCard label="OT" value={data.ot_total} />
//             <KpiCard label="OT descartadas" value={data.ot_descartadas} />
//             <KpiCard label="Items pedidos" value={data.items_pedidos} />
//             <KpiCard label="Items cumplidos" value={data.items_cumplidos} />
//             <KpiCard label="% cumplido" value={`${data.pct_cumplido}%`} />
//           </div>

//           <table className="w-full text-sm border-collapse">
//             <thead>
//               <tr className="text-left border-b">
//                 <th className="py-1">Ubicación</th>
//                 <th>Artículo</th>
//                 <th className="text-right">Pedida</th>
//                 <th className="text-right">Cumplida</th>
//                 <th className="text-right">Faltante</th>
//                 <th className="text-right">Precio</th>
//               </tr>
//             </thead>
//             <tbody>
//               {data.items_faltantes.map((it: any, i: number) => (
//                 <tr key={i} className="border-b">
//                   <td className="py-1">{it.Ubicacion}</td>
//                   <td>{it.CodArticulo}</td>
//                   <td className="text-right">{it.CantPedida}</td>
//                   <td className="text-right">{it.CantCumplida}</td>
//                   <td className="text-right">{it.Faltante}</td>
//                   <td className="text-right">{it.PrecioVenta}</td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </>
//       )}
//     </div>
//   );
// }

// function KpiCard({ label, value }: { label: string; value: any }) {
//   return (
//     <div className="border rounded p-3">
//       <div className="text-xs text-muted-foreground">{label}</div>
//       <div className="text-lg font-semibold">{value}</div>
//     </div>
//   );
// }

function ResumenOt() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const cargar = async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const res = await fetch(`/api/deposito/resumen-ot?${qs.toString()}`);
    setData(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <label className="text-sm">
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="border rounded px-2 py-1 ml-2"
          />
        </label>
        <label className="text-sm">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border rounded px-2 py-1 ml-2"
          />
        </label>
        <button onClick={cargar} className="border rounded px-3 py-1 text-sm">
          {loading ? "Cargando..." : "Filtrar"}
        </button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="OT" value={data.ot_total} />
            <KpiCard label="OT descartadas" value={data.ot_descartadas} />
            <KpiCard label="Items pedidos" value={data.items_pedidos} />
            <KpiCard label="Items cumplidos" value={data.items_cumplidos} />
            <KpiCard label="% cumplido" value={`${data.pct_cumplido}%`} />
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Ubicación</th>
                <th>Artículo</th>
                <th className="text-right">Pedida</th>
                <th className="text-right">Cumplida</th>
                <th className="text-right">Faltante</th>
                <th className="text-right">Precio</th>
              </tr>
            </thead>
            <tbody>
              {data.items_faltantes.map((it: any, i: number) => (
                <tr key={i} className="border-b">
                  <td className="py-1">{it.Ubicacion}</td>
                  <td>{it.CodArticulo}</td>
                  <td className="text-right">{it.CantPedida}</td>
                  <td className="text-right">{it.CantCumplida}</td>
                  <td className="text-right">{it.Faltante}</td>
                  <td className="text-right">{it.PrecioVenta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}