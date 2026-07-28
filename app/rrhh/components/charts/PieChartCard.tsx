"use client";
import { memo } from "react";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { everWearTheme as t } from "@/lib/rrhh/theme";
import { CardTitle } from "@/components/ui/card"; // ← ¡Este import faltaba!

type Props = {
  title: string;
  data: Array<{ name: string; value: number }>;
  height?: number;
  // Paleta opcional para las porciones (fallback = t.palette, sin cambios
  // para los usos existentes que no la pasan).
  colors?: string[];
};

function PieChartCard({ title, data, height = 300, colors }: Props) {
  const palette = colors ?? t.palette;
  return (
    <>
      <CardTitle
        className="mb-4 text-lg font-semibold"
        style={{ color: t.text }}
      >
        {title}
      </CardTitle>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={90}
            label={{ fill: t.text, fontSize: 12 }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              color: t.text,
            }}
          />
          <Legend wrapperStyle={{ color: t.textMuted, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </>
  );
}

export default memo(PieChartCard);
