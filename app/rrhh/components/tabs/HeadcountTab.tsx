"use client";

import { Users, Cake, Briefcase, UserPlus } from "lucide-react";
import type { ParsedFile } from "@/lib/rrhh/parseXlsx";
import KpiCard from "@/app/rrhh/components/KpiCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import PieChartCard from "@/app/rrhh/components/charts/PieChartCard";
import LineChartCard from "@/app/rrhh/components/charts/LineChartCard";
import FilteredEmployeesTable from "@/app/rrhh/components/tabs/FilteredEmployeesTable";

import {
  empleadosKpis,
  headcountPorArea,
  distribucionPorSexo,
  distribucionEdades,
  ingresosPorMes,
} from "@/lib/rrhh/aggregations";

export default function HeadcountTab({ file }: { file: ParsedFile }) {
  const kpis = empleadosKpis(file);
  const porArea = headcountPorArea(file);
  const porSexo = distribucionPorSexo(file);
  const porEdad = distribucionEdades(file);
  const ingresos = ingresosPorMes(file);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Empleados" value={kpis.headcount} icon={Users} />
        <KpiCard
          label="Edad promedio"
          value={`${kpis.edadPromedio} años`}
          icon={Cake}
          accent="zinc"
        />
        <KpiCard
          label="Antigüedad promedio"
          value={`${kpis.antiguedadPromedio} años`}
          icon={Briefcase}
          accent="zinc"
        />
        <KpiCard
          label="Ingresos este mes"
          value={kpis.ingresosUltimoMes}
          icon={UserPlus}
          accent="green"
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {porArea.length > 0 && (
          <BarChartCard
            title="Empleados por área"
            data={porArea}
            xKey="name"
            yKey="value"
          />
        )}
        {porEdad.length > 0 && (
          <BarChartCard
            title="Distribución por edad"
            data={porEdad}
            xKey="name"
            yKey="value"
          />
        )}
        {porSexo.length > 0 && (
          <PieChartCard title="Distribución por género" data={porSexo} />
        )}
        {ingresos.length > 0 && (
          <LineChartCard
            title="Ingresos últimos 12 meses"
            data={ingresos}
            xKey="name"
            yKeys={["ingresos"]}
          />
        )}
      </div>
        <FilteredEmployeesTable file={file} />
    </div>
  );
}
