"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Zap, TrendingUp, Hourglass } from "lucide-react";
import KpiCard from "@/app/rrhh/components/KpiCard";
import PieChartCard from "@/app/rrhh/components/charts/PieChartCard";
import {
  TabHeader,
  Panel,
  ErrMsg,
  Empty,
} from "@/app/rrhh/components/IndicadorUI";
import {
  computeIndicadores,
  fetchResumen,
  mesRange,
  currentYm,
  type ResumenRow,
} from "@/lib/rrhh/asistenciaIndicadores";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n);

// Pestaña Horas — alimentada por la BD de fichadas (API resumen).
export default function HsExtrasTab() {
  const [ym, setYm] = useState(currentYm());
  const [rows, setRows] = useState<ResumenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const { desde, hasta } = mesRange(ym);
    setLoading(true);
    setError(null);
    fetchResumen(desde, hasta)
      .then((d) => alive && setRows(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ym]);

  const ind = useMemo(() => computeIndicadores(rows), [rows]);

  return (
    <div className="space-y-6">
      <TabHeader
        title="Indicadores — Horas"
        sub="Total, extras e inactivas calculadas desde las fichadas"
        ym={ym}
        setYm={setYm}
        loading={loading}
      />

      {error && <ErrMsg msg={error} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total horas mensual EW"
          value={fmt(ind.totalHoras)}
          icon={Clock}
          accent="yellow"
          hint="RRHH (con tope)"
        />
        <KpiCard
          label="Total horas extras"
          value={fmt(ind.horasExtras)}
          icon={Zap}
          accent="blue"
        />
        <KpiCard
          label="Ratio hs. extras"
          value={`${fmt(ind.ratioExtras)} %`}
          icon={TrendingUp}
          accent="green"
        />
        <KpiCard
          label="Ratio hs. inactivas"
          value={`${fmt(ind.ratioInactivas)} %`}
          icon={Hourglass}
          accent="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel>
          {ind.extrasPorArea.length > 0 ? (
            <PieChartCard
              title="Cantidad de Hs. extras por áreas"
              data={ind.extrasPorArea}
            />
          ) : (
            <Empty
              msg={loading ? "Cargando…" : "Sin horas extra en el período."}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
