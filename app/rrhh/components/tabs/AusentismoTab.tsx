"use client";

import { CalendarX, Users, CalendarDays } from "lucide-react";
import type { ParsedFile } from "@/lib/rrhh/parseXlsx";
import KpiCard from "@/app/rrhh/components/KpiCard";
import LineChartCard from "@/app/rrhh/components/charts/LineChartCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import {
  ausentismoKpis,
  asistenciaPorMes,
  topAusenciasPorPersona,
} from "@/lib/rrhh/aggregations";

export default function AusentismoTab({ file }: { file: ParsedFile }) {
  const kpis = ausentismoKpis(file);
  const porMes = asistenciaPorMes(file);
  const topPersonas = topAusenciasPorPersona(file, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Total registros" value={kpis.totalRegistros} icon={CalendarX} accent="orange" />
        <KpiCard label="Personas involucradas" value={kpis.personasInvolucradas} icon={Users} accent="zinc" />
        <KpiCard label="Días con registros" value={kpis.diasUnicos} icon={CalendarDays} accent="zinc" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {porMes.length > 0 && (
          <LineChartCard title="Horas asistidas por mes" data={porMes} xKey="name" yKeys={["horas"]} />
        )}
        {topPersonas.length > 0 && (
          <BarChartCard
            title="Top 10 — registros por persona"
            data={topPersonas}
            xKey="name"
            yKey="value"
          />
        )}
      </div>
    </div>
  );
}
