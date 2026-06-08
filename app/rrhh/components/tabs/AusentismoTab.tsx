"use client";

import { useEffect, useMemo, useState } from "react";
import { Percent, CalendarX, Users } from "lucide-react";
import KpiCard from "@/app/rrhh/components/KpiCard";
import PieChartCard from "@/app/rrhh/components/charts/PieChartCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
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

// Pestaña Ausentismo — alimentada por la BD de fichadas (API resumen).
// Por estado, excluye Normal / Ausente / Revisar (ver ESTADOS_NO_AUSENCIA).
export default function AusentismoTab() {
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
        title="Indicadores — Ausentismo"
        sub="Por estado, excluye Normal / Ausente / Revisar"
        ym={ym}
        setYm={setYm}
        loading={loading}
      />

      {error && <ErrMsg msg={error} />}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard
          label="Ratio de ausencia por jornada"
          value={`${fmt(ind.ratioAusencia)} %`}
          icon={Percent}
          accent="orange"
          hint={`${ind.diasAusencia} de ${ind.jornadasEsperadas} jornadas`}
        />
        <KpiCard
          label="Días de ausencia"
          value={ind.diasAusencia}
          icon={CalendarX}
          accent="zinc"
        />
        <KpiCard
          label="Personas con ausencias"
          value={ind.personasAusentes}
          icon={Users}
          accent="zinc"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel>
          {ind.ausenciaPorMotivo.length > 0 ? (
            <PieChartCard
              title="Ausentismo por motivo"
              data={ind.ausenciaPorMotivo}
            />
          ) : (
            <Empty
              msg={loading ? "Cargando…" : "Sin ausencias en el período."}
            />
          )}
        </Panel>
        <Panel>
          {ind.ausenciaPorArea.length > 0 ? (
            <BarChartCard
              title="Distribución por área"
              data={ind.ausenciaPorArea}
              xKey="name"
              yKey="value"
              currency={false}
            />
          ) : (
            <Empty
              msg={loading ? "Cargando…" : "Sin ausencias en el período."}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
