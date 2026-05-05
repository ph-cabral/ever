"use client";

import { DollarSign, Users, TrendingUp, Wallet } from "lucide-react";
import type { ParsedFile } from "@/lib/rrhh/parseXlsx";
import KpiCard from "@/app/rrhh/components/KpiCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import { nominaKpis, costoPorArea, netoPromedioPorArea } from "@/lib/rrhh/aggregations";

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export default function NominaTab({ file }: { file: ParsedFile }) {
  const kpis = nominaKpis(file);
  const costos = costoPorArea(file);
  const promedios = netoPromedioPorArea(file);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total neto + bono" value={fmtARS(kpis.totalNeto)} icon={Wallet} accent="green" />
        <KpiCard label="Costo total nómina" value={fmtARS(kpis.totalCostos)} icon={DollarSign} accent="green" />
        <KpiCard label="Neto promedio" value={fmtARS(kpis.netoPromedio)} icon={TrendingUp} accent="zinc" />
        <KpiCard label="Empleados liquidados" value={kpis.empleadosLiquidados} icon={Users} accent="zinc" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {costos.length > 0 && (
          <BarChartCard title="Costo total por área" data={costos} xKey="name" yKey="costo" />
        )}
        {promedios.length > 0 && (
          <BarChartCard title="Neto promedio por área" data={promedios} xKey="name" yKey="promedio" />
        )}
      </div>
    </div>
  );
}
