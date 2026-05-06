"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
          <XAxis dataKey={xKey} stroke={t.textMuted} tick={{ fontSize: 12 }} />
          <YAxis stroke={t.textMuted} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              color: t.text,
            }}
            cursor={{ fill: t.border, opacity: 0.3 }}
          />
          <Legend wrapperStyle={{ color: t.textMuted, fontSize: 12 }} />
          <Bar dataKey={yKey} fill={t.primary} radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey={yKey}
              position="insideTop"
              fill={t.bgCard} // ← El número de la barra usa el color del fondo para "calar" el texto
              fontSize={18}
              fontWeight={50}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
