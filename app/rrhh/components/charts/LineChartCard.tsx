"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { everWearTheme as t } from "@/lib/rrhh/theme";

type Props = {
  title: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKeys: string[];
  height?: number;
};

export default function LineChartCard({ title, data, xKey, yKeys, height = 300 }: Props) {
  return (
    <div className="rounded-lg border p-4" style={{ background: t.bgCard, borderColor: t.border }}>
      <h3 className="mb-4 text-sm font-semibold" style={{ color: t.text }}>{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
          <XAxis dataKey={xKey} stroke={t.textMuted} tick={{ fontSize: 12 }} />
          <YAxis stroke={t.textMuted} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: t.bgCard, border: `1px solid ${t.border}`, color: t.text }}
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
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

