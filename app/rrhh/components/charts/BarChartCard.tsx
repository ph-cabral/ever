"use client";

import { memo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { everWearTheme as t } from "@/lib/rrhh/theme";
import { CardTitle } from "@/components/ui/card";

type LabelPos = "top" | "insideTop" | "inside" | "insideBottom" | "bottom" | "center";

type Props = {
  title: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  height?: number;
  ubicacionLabel?: LabelPos;
  labelFontSize?: number;
  labelFill?: string;
  xTickFontSize?: number;
  xAngle?: number;
  currency?: boolean;
};

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);


function BarChartCard({
  title, data, xKey, yKey, height = 300,
  ubicacionLabel = "top", labelFontSize = 12, labelFill = t.text, xTickFontSize = 12, xAngle = -45, currency = true,
}: Props) {
  const fmt = currency ? fmtARS : fmtNum;   
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
            tick={{ fontSize: xTickFontSize }}
            angle={xAngle}
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
            formatter={(value) => fmt(Number(value))}
          />
          <Bar dataKey={yKey} fill={t.primary} radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey={yKey}
              position={ubicacionLabel}
              fill={labelFill}
              fontSize={labelFontSize}
              fontWeight={600}
              formatter={(value) => fmt(Number(value))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

export default memo(BarChartCard);
