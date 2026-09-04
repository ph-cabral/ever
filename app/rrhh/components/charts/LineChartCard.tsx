"use client";
import { memo } from "react";

import {
  LineChart,
  Line,
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
  yKeys: string[];
  height?: number;
  // Color por serie (uno por elemento de `yKeys`, cíclico). Opcional — sin
  // esto se comporta igual que antes (t.palette por posición).
  colors?: string[];
  // Con una sola serie la leyenda no aporta nada: se puede apagar. Opcional,
  // default true = comportamiento anterior.
  legend?: boolean;
  labelFontSize?: number;
  labelFill?: string;
};

function LineChartCard({
  title, data, xKey, yKeys, height = 300,
  colors, legend = true, labelFontSize = 18, labelFill = t.textMuted,
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
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
          <XAxis dataKey={xKey} stroke={t.textMuted} tick={{ fontSize: 12 }} />
          <YAxis stroke={t.textMuted} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              color: t.text,
            }}
          />
          {legend && <Legend wrapperStyle={{ color: t.textMuted, fontSize: 12 }} />}
          {yKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors ? colors[i % colors.length] : t.palette[i % t.palette.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            >
              <LabelList
                dataKey={key}
                position="top"
                fill={labelFill}
                fontSize={labelFontSize}
                fontWeight={500}
              />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

export default memo(LineChartCard);
