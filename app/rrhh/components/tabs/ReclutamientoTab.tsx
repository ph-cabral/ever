"use client";

import { useEffect, useState } from "react";
import { FileText, TrendingUp, Loader2 } from "lucide-react";
import KpiCard from "@/app/rrhh/components/KpiCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import { Panel, ErrMsg, Empty } from "@/app/rrhh/components/IndicadorUI";

type CvPorMes = { mes: string; cantidad: number };

// Pestaña Reclutamiento — CVs recibidos por mes, desde Postgres
// rag_system.documento_aprobado (tipo='CV'), vía indicadores-api.
// Ver app/api/rrhh/reclutamiento/cvs-por-mes/route.ts.
export default function ReclutamientoTab() {
  const [rows, setRows] = useState<CvPorMes[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch("/api/rrhh/reclutamiento/cvs-por-mes?meses=12")
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e?.error ?? "Error al cargar CVs");
        }
        return r.json();
      })
      .then((d) => alive && setRows(d.rows ?? []))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const total = rows.reduce((a, r) => a + r.cantidad, 0);
  const ultimoMes = rows.at(-1);
  const promedio = rows.length ? Math.round(total / rows.length) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">
          Reclutamiento
        </h2>
        <p className="text-zinc-500 text-sm mt-1">
          CVs recibidos por mes — rag_system.documento_aprobado
        </p>
      </div>

      {error && <ErrMsg msg={error} />}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="CVs últimos 12 meses" value={total} icon={FileText} accent="yellow" />
        <KpiCard
          label="CVs mes actual"
          value={ultimoMes?.cantidad ?? 0}
          icon={TrendingUp}
          accent="green"
          hint={ultimoMes?.mes}
        />
        <KpiCard label="Promedio mensual" value={promedio} icon={FileText} accent="zinc" />
      </div>

      <Panel>
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-zinc-500 text-sm">
            <Loader2 size={16} className="animate-spin text-yellow-400" /> Cargando…
          </div>
        ) : rows.length > 0 ? (
          <BarChartCard
            title="CVs recibidos por mes"
            data={rows}
            xKey="mes"
            yKey="cantidad"
            currency={false}
          />
        ) : (
          <Empty msg="Sin CVs registrados en el período." />
        )}
      </Panel>
    </div>
  );
}
