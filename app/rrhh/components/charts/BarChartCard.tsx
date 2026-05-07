"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { everWearTheme as t } from "@/lib/rrhh/theme";
import { CardTitle } from "@/components/ui/card"; // ← ¡Este import faltaba!

type Props = {
  title: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  height?: number;
};

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export default function BarChartCard({
  title,
  data,
  xKey,
  yKey,
  height = 300,
}: Props) {
  return (
    <>
      <CardTitle
        className="mb-4 text-lg font-semibold"
        style={{ color: t.text }}
      >
        {title}
      </CardTitle>

      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
          <XAxis
            dataKey={xKey}
            stroke={t.textMuted}
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis stroke={t.textMuted} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              color: t.text,
            }}
            cursor={{ fill: t.border, opacity: 0.3 }}
            formatter={(value) => fmtARS(Number(value))}
          />
          <Bar dataKey={yKey} fill={t.primary} radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey={yKey}
              position="top"
              fill={t.text}
              fontSize={12}
              fontWeight={600}
              formatter={(value) => fmtARS(Number(value))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
