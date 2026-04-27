"use client";

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { everWearTheme as t } from "@/lib/rrhh/theme";

type Props = {
  title: string;
  data: Array<{ name: string; value: number }>;
  height?: number;
};

export default function PieChartCard({ title, data, height = 300 }: Props) {
  return (
    <div className="rounded-lg border p-4" style={{ background: t.bgCard, borderColor: t.border }}>
      <h3 className="mb-4 text-sm font-semibold" style={{ color: t.text }}>{title}</h3>
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
              <Cell key={i} fill={t.palette[i % t.palette.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: t.bgCard, border: `1px solid ${t.border}`, color: t.text }}
          />
          <Legend wrapperStyle={{ color: t.textMuted, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

