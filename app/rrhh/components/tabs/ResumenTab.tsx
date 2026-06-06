"use client";

import { useMemo } from "react";
import { Users, DollarSign, CalendarX, Clock, UploadCloud } from "lucide-react";
import type { ParsedFile, DetectedFileType } from "@/lib/rrhh/parseXlsx";
import KpiCard from "@/app/rrhh/components/KpiCard";
import BarChartCard from "@/app/rrhh/components/charts/BarChartCard";
import PieChartCard from "@/app/rrhh/components/charts/PieChartCard";
import {
  empleadosKpis,
  headcountPorArea,
  nominaKpis,
  costoPorArea,
  ausentismoKpis,
  hsExtrasKpis,
} from "@/lib/rrhh/aggregations";

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

type Props = {
  data: Partial<Record<DetectedFileType, ParsedFile>>;
  onUpload: () => void;
};

export default function ResumenTab({ data, onUpload }: Props) {
  const empleados = data.empleados;
  const sueldos = data.sueldos;
  const ausentismos = data.ausentismos;
  const hsExtras = data.hs_extras;

  const noData = !empleados && !sueldos && !ausentismos && !hsExtras;

  const kEmp = useMemo(() => (empleados ? empleadosKpis(empleados) : null), [empleados]);
  const kNom = useMemo(() => (sueldos ? nominaKpis(sueldos) : null), [sueldos]);
  const kAus = useMemo(() => (ausentismos ? ausentismoKpis(ausentismos) : null), [ausentismos]);
  const kHs = useMemo(() => (hsExtras ? hsExtrasKpis(hsExtras) : null), [hsExtras]);
  const porArea = useMemo(() => (empleados ? headcountPorArea(empleados) : []), [empleados]);
  const costos = useMemo(() => (sueldos && empleados ? costoPorArea(sueldos, empleados) : []), [sueldos, empleados]);

  if (noData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <UploadCloud size={48} className="text-zinc-700" />
        <div>
          <p className="text-zinc-400 font-medium">No hay datos cargados</p>
          <p className="text-zinc-600 text-sm mt-1">
            Arrastrá los Excel a cualquier parte, o{" "}
            <button onClick={onUpload} className="text-yellow-400 hover:underline">hacé clic para seleccionar</button>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">Resumen</h2>
        <p className="text-zinc-500 text-sm mt-1">Vista general de todas las fuentes cargadas</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kEmp && <KpiCard label="Headcount" value={kEmp.headcount} icon={Users} />}
        {kNom && <KpiCard label="Costo nómina" value={fmtARS(kNom.totalCostos)} icon={DollarSign} accent="green" />}
        {kAus && <KpiCard label="Registros ausentismo" value={kAus.totalRegistros} icon={CalendarX} accent="orange" />}
        {kHs && <KpiCard label="Horas extra" value={kHs.totalHoras} icon={Clock} accent="blue" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {porArea.length > 0 && <PieChartCard title="Headcount por área" data={porArea} />}
        {costos.length > 0 && <BarChartCard title="Costo total por área" data={costos} xKey="name" yKey="costo" />}
      </div>
    </div>
  );
}
