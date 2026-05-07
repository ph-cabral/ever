// app/rrhh/components/charts/HorizontalBarChartCard.tsx
"use client";

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

interface HorizontalBarChartCardProps {
  title: string;
  data: Array<{ name: string; value: number }>;
  xKey?: string;
  yKey?: string;
  color?: string;
  labelFill?: string;
  ubicacionLabel?: string;
  labelFontSize?: number;
}

export default function HorizontalBarChartCard({
  title,
  data,
  xKey = "name",
  yKey = "value",
  color = t.palette[0],
  ubicacionLabel,
  labelFill,
}: HorizontalBarChartCardProps) {
  const sortedData = [...data].sort((a, b) => b[yKey] - a[yKey]);

  return (
    <>
      <CardTitle
        className="mb-4 text-lg font-semibold"
        style={{ color: t.text }}
      >
        {title}
      </CardTitle>

      {/* <CardContent>
        <div className="h-[600px]"> */}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={sortedData}>
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke={t.grid}
          />{" "}
          {/* ← Centralizado */}
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey={xKey}
            width={120}
            tick={{ fontSize: 12, fill: t.textMuted }} // ← Centralizado
            interval={0}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: t.bgCard, // ← Centralizado
              border: `1px solid ${t.border}`, // ← Centralizado
              color: t.text, // ← Centralizado
            }}
            formatter={(value: number) => [`${value} empleados`, ""]}
          />
          <Bar dataKey={yKey} fill={color} radius={[0, 4, 4, 0]}>
            <LabelList
              dataKey={yKey}
              position="insideRight"
              fill={labelFill ?? t.bgCard} // ← El número de la barra usa el color del fondo para "calar" el texto
              fontSize={18}
              fontWeight={50}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
