"use client";

import { useMemo } from "react";
import { Clock, Users, TrendingUp } from "lucide-react";
import type { ParsedFile } from "@/lib/rrhh/parseXlsx";
import KpiCard from "@/app/rrhh/components/KpiCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import LineChartCard from "@/app/rrhh/components/charts/LineChartCard";
import { hsExtrasKpis, hsExtrasPorArea, hsExtrasPorMes } from "@/lib/rrhh/aggregations";

export default function HsExtrasTab({ file }: { file: ParsedFile }) {
  const kpis = useMemo(() => hsExtrasKpis(file), [file]);
  const porArea = useMemo(() => hsExtrasPorArea(file), [file]);
  const porMes = useMemo(() => hsExtrasPorMes(file), [file]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Total horas extra" value={kpis.totalHoras} icon={Clock} accent="blue" />
        <KpiCard label="Personas con extras" value={kpis.personasConExtras} icon={Users} accent="zinc" />
        <KpiCard label="Promedio por persona" value={`${kpis.promedioPorPersona} hs`} icon={TrendingUp} accent="zinc" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {porArea.length > 0 && <BarChartCard title="Horas extra por área" data={porArea} xKey="name" yKey="horas" />}
        {porMes.length > 0 && <LineChartCard title="Horas extra por mes" data={porMes} xKey="name" yKeys={["horas"]} />}
      </div>

      {porArea.length === 0 && porMes.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-8 text-center">
          <p className="text-zinc-500 text-sm">
            No se detectaron columnas de horas / fecha / área en este archivo. Verificá que el
            Excel tenga columnas como <code className="text-yellow-400">Horas</code>,{" "}
            <code className="text-yellow-400">FECHA</code> y{" "}
            <code className="text-yellow-400">AREA</code>.
          </p>
        </div>
      )}
    </div>
  );
}
