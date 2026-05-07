import { DollarSign, TrendingUp, Wallet } from "lucide-react";
import type { ParsedFile } from "@/lib/rrhh/parseXlsx";
import KpiCard from "@/app/rrhh/components/KpiCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import { Card } from "@/components/ui/card";

import {
  nominaKpis,
  costoPorArea,
  netoPromedioPorArea,
} from "@/lib/rrhh/aggregations";

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export default function NominaTab({
  file,
  fileEmpleados,
}: {
  file: ParsedFile;
  fileEmpleados: ParsedFile;
}) {
  const kpis = nominaKpis(file);
  const costos = costoPorArea(file, fileEmpleados);
  const promedios = netoPromedioPorArea(fileEmpleados, file);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total neto + bono"
          value={fmtARS(kpis.totalNeto)}
          icon={Wallet}
          accent="green"
        />
        <KpiCard
          label="Costo total nómina"
          value={fmtARS(kpis.totalCostos)}
          icon={DollarSign}
          accent="green"
        />
        <KpiCard
          label="Neto promedio"
          value={fmtARS(kpis.netoPromedio)}
          icon={TrendingUp}
          accent="zinc"
        />
      </div>

      <div className="gap-4">
        {promedios.length > 0 && (
          // <BarChartCard
          // />
          <BarChartCard
            height={400}
          title="Neto promedio por área"
          ubicacionLabel="top"
          labelFontSize={14}
          data={promedios}
          xKey="name"
          yKey="promedio"
            labelFill="#fff"
            xTickFontSize={12}
            xAngle={-45}
          />
        )}
      </div>
    </div>
  );
}
