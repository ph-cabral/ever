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
};

function LineChartCard({ title, data, xKey, yKeys, height = 300 }: Props) {
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
          <Legend wrapperStyle={{ color: t.textMuted, fontSize: 12 }} />
          {yKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={t.palette[i % t.palette.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            >
              <LabelList
                dataKey={key}
                position="top"
                fill={t.textMuted} // Color gris oscuro para que se lea bien
                fontSize={18}
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
