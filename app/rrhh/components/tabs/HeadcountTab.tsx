// app/rrhh/components/tabs/HeadcountTab.tsx
"use client";

import { useMemo } from "react";
import { Users, Cake, Briefcase, UserPlus } from "lucide-react";
import type { ParsedFile } from "@/lib/rrhh/parseXlsx";
import KpiCard from "@/app/rrhh/components/KpiCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import PieChartCard from "@/app/rrhh/components/charts/PieChartCard";
import LineChartCard from "@/app/rrhh/components/charts/LineChartCard";
import HorizontalBarChartCard from "@/app/rrhh/components/charts/HorizontalBarChartCard";
import FilteredEmployeesTable from "@/app/rrhh/components/tabs/FilteredEmployeesTable";
import { Card } from "@/components/ui/card";
import { everWearTheme as t } from "@/lib/rrhh/theme";

import {
  empleadosKpis,
  headcountPorArea,
  distribucionPorSexo,
  distribucionEdades,
  ingresosPorMes,
} from "@/lib/rrhh/aggregations";

export default function HeadcountTab({ file }: { file: ParsedFile }) {
  const kpis = useMemo(() => empleadosKpis(file), [file]);
  const porArea = useMemo(() => headcountPorArea(file), [file]);
  const porSexo = useMemo(() => distribucionPorSexo(file), [file]);
  const porEdad = useMemo(() => distribucionEdades(file), [file]);
  const ingresos = useMemo(() => ingresosPorMes(file), [file]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Empleados" value={kpis.headcount} icon={Users} />
        <KpiCard label="Edad promedio" value={`${kpis.edadPromedio} años`} icon={Cake} accent="zinc" />
        <KpiCard label="Antigüedad promedio" value={`${kpis.antiguedadPromedio} años`} icon={Briefcase} accent="zinc" />
        <KpiCard label="Ingresos mes pasado" value={kpis.ingresosUltimoMes} icon={UserPlus} accent="green" />
      </div>

      <div className="grid grid-cols-1  lg:grid-cols-2 gap-4">
        {porArea.length > 0 && (
          <Card className="col-span-1 rounded-lg border p-4" style={{ background: t.bgCard, borderColor: t.border }}>
            <HorizontalBarChartCard title="Empleados por área" data={porArea} xKey="name" yKey="value" />
          </Card>
        )}

        {porEdad.length > 0 && (
          <Card className="col-span-1 rounded-lg border p-4" style={{ background: t.bgCard, borderColor: t.border }}>
            <BarChartCard height={350} title="Distribución por edad" ubicacionLabel="insideTop" labelFontSize={14} data={porEdad} xKey="name" yKey="value" xTickFontSize={14} />
            <LineChartCard title="Ingresos últimos 12 meses" data={ingresos} xKey="name" yKeys={["ingresos"]} />
          </Card>
        )}

        {porSexo.length > 0 && <PieChartCard title="Distribución por género" data={porSexo} />}
      </div>

      <FilteredEmployeesTable file={file} />
    </div>
  );
}
