"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { everWearTheme as t } from "@/lib/rrhh/theme";

type Props = {
  title: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  height?: number;
};

export default function BarChartCard({ title, data, xKey, yKey, height = 300 }: Props) {
  return (
    <div className="rounded-lg border p-4" style={{ background: t.bgCard, borderColor: t.border }}>
      <h3 className="mb-4 text-sm font-semibold" style={{ color: t.text }}>{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
          <XAxis dataKey={xKey} stroke={t.textMuted} tick={{ fontSize: 12 }} />
          <YAxis stroke={t.textMuted} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: t.bgCard, border: `1px solid ${t.border}`, color: t.text }}
            cursor={{ fill: t.border, opacity: 0.3 }}
          />
          <Legend wrapperStyle={{ color: t.textMuted, fontSize: 12 }} />
          <Bar dataKey={yKey} fill={t.primary} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

