"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { useEffect, useState } from "react";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtHoras(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm.toString().padStart(2, "0")}m`;
}

function fmtStack(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${mm.toString().padStart(2, "0")}hs`;
}

function hToHHMM(h: number): string {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}:${String(mm).padStart(2, "0")}hs`;
}

const PRIORIDAD_COLOR: Record<number, string> = {
  1: "bg-red-100 text-red-700 border border-red-200",
  2: "bg-orange-100 text-orange-700 border border-orange-200",
  3: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  4: "bg-blue-100 text-blue-700 border border-blue-200",
  13: "bg-gray-100 text-gray-600 border border-gray-200",
};

// ── tipos ─────────────────────────────────────────────────────────────────────

interface Prioridad {
  Prioridad: number;
  cantidad: number;
  "Tiempo Promedio": string;
}

interface MetricaMes {
  nombre_mes: string;
  total_ops_unicas: number;
  reg_a_conf: number;
  conf_a_arm: number;
  arm_a_cierre: number;
  total_tiempo_pag1: number;
  total_tiempo_pag2: number;
}

interface DashboardData {
  prioridades: Prioridad[];
  metricas_mensuales: MetricaMes[];
  metricas_por_prioridad: MetricaMes[];
}

// ── labels ────────────────────────────────────────────────────────────────────

const TopLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (!value || value < 0.5) return null;
  return (
    <text
      x={x + width / 2}
      y={y + 14}
      fill="#fff"
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {value}h
    </text>
  );
};

const OuterLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      fill="#374151"
      textAnchor="middle"
      fontSize={12}
      fontWeight={700}
    >
      {value}h
    </text>
  );
};

// ── componente principal ──────────────────────────────────────────────────────

export function IndicadoresDashboard({ data }: { data: DashboardData }) {
  const { prioridades, metricas_mensuales, metricas_por_prioridad } = data;

  // Fix SSR: Recharts solo renderiza client-side
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // justo después de los dos useEffect

  const ultimoMes = metricas_mensuales[metricas_mensuales.length - 1];
  const totalOps = prioridades.reduce((acc, p) => acc + p.cantidad, 0);

  const dataBarrasMensuales = metricas_mensuales.map((m) => ({
    mes: m.nombre_mes,
    "Reg → Conf": parseFloat(m.reg_a_conf.toFixed(2)),
    "Conf → Arm": parseFloat(m.conf_a_arm.toFixed(2)),
    "Arm → Cierre": parseFloat(m.arm_a_cierre.toFixed(2)),
    ops: m.total_ops_unicas,
  }));

  const dataBarrasSuspension = metricas_mensuales.map((m) => ({
    mes: m.nombre_mes,
    "Reg → Susp": parseFloat(m.reg_a_susp.toFixed(2)),
    "Susp → Conf": parseFloat(m.susp_a_conf.toFixed(2)),
    ops: m.count_susp_conf,
  }));

  const dataBarrasPrioridad = metricas_por_prioridad
    .filter((m) =>
      ["Prioridad 1", "Prioridad 2", "Prioridad 3"].includes(m.nombre_mes),
    )
    .map((m) => ({
      prioridad: m.nombre_mes,
      "Reg → Conf": parseFloat(m.reg_a_conf.toFixed(2)),
      "Conf → Arm": parseFloat(m.conf_a_arm.toFixed(2)),
      "Arm → Cierre": parseFloat(m.arm_a_cierre.toFixed(2)),
      total: parseFloat(m.total_tiempo_pag1.toFixed(2)),
      ops: m.count_reg_a_conf ?? 0,
    }));

  return (
    <div>
      <div className="space-y-8 pb-12">
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl px-8 py-6 text-white shadow">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">
            Panel de supervisión
          </p>
          <h1 className="text-2xl font-bold">Tiempos de Pedidos</h1>
          <p className="text-slate-400 text-sm mt-1">
            Período activo:{" "}
            <span className="text-white font-medium">
              {ultimoMes.nombre_mes}
            </span>
          </p>
        </div>

        {/* ── Sección 1: Cards ── */}
        <section>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Resumen — {ultimoMes.nombre_mes}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-0 shadow-sm bg-white">
              <CardHeader className="pb-1 pt-5 px-6">
                <CardTitle className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                  Operaciones únicas
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-5">
                <p className="text-4xl font-extrabold text-slate-800">
                  {ultimoMes.total_ops_unicas.toLocaleString("es-AR")}
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white">
              <CardHeader className="pb-1 pt-5 px-6">
                <CardTitle className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                  Tiempo promedio — flujo normal
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-5">
                <p className="text-4xl font-extrabold text-indigo-600">
                  {fmtHoras(ultimoMes.total_tiempo_pag1)}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  reg → conf → arm → cierre
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white">
              <CardHeader className="pb-1 pt-5 px-6">
                <CardTitle className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                  Tiempo promedio — con suspensión
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-5">
                <p className="text-4xl font-extrabold text-amber-500">
                  {fmtHoras(ultimoMes.total_tiempo_pag2)}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  incluye pasos de suspensión
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Sección 2: Barras apiladas por mes ── */}
        <section>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Tiempos entre Etapas - Registro → Cierre
          </p>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="pt-6 px-2 pb-4">
              <div style={{ width: "100%", height: 380 }}>
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dataBarrasMensuales}
                      margin={{ top: 48, right: 32, left: 8, bottom: 0 }}
                      barCategoryGap="70%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="mes"
                        tick={{ fontSize: 13, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `${v}hs`}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          fmtStack(v),
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          border: "none",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                        }}
                      />

                      {/* Amarillo abajo: Reg → Conf */}
                      <Bar dataKey="Reg → Conf" stackId="a" fill="#FFE066">
                        <LabelList
                          content={(props: any) => {
                            const { x, y, width, height, value } = props;
                            if (!value || height < 16) return null;
                            return (
                              <text
                                x={x + width / 2}
                                y={y + height / 2 + 5}
                                fill="#1e293b"
                                textAnchor="middle"
                                fontSize={13}
                                fontWeight={700}
                              >
                                {fmtStack(value)}
                              </text>
                            );
                          }}
                        />
                      </Bar>

                      {/* Gris medio: Conf → Arm */}
                      <Bar dataKey="Conf → Arm" stackId="a" fill="#888888">
                        <LabelList
                          content={(props: any) => {
                            const { x, y, width, height, value } = props;
                            if (!value || height < 16) return null;
                            return (
                              <text
                                x={x + width / 2}
                                y={y + height / 2 + 5}
                                fill="#ffffff"
                                textAnchor="middle"
                                fontSize={13}
                                fontWeight={700}
                              >
                                {fmtStack(value)}
                              </text>
                            );
                          }}
                        />
                      </Bar>

                      {/* Gris claro arriba: Arm → Cierre */}
                      <Bar
                        dataKey="Arm → Cierre"
                        stackId="a"
                        fill="#C0C0C0"
                        radius={[4, 4, 0, 0]}
                      >
                        <LabelList
                          content={(props: any) => {
                            const { x, y, width, height, value, index } = props;
                            const d = dataBarrasMensuales[index];
                            const total =
                              d["Reg → Conf"] +
                              d["Conf → Arm"] +
                              d["Arm → Cierre"];
                            const ops = d.ops;
                            return (
                              <g>
                                {/* Label dentro: Arm → Cierre */}
                                {value && height >= 16 && (
                                  <text
                                    x={x + width / 2}
                                    y={y + height / 2 + 5}
                                    fill="#1e293b"
                                    textAnchor="middle"
                                    fontSize={13}
                                    fontWeight={700}
                                  >
                                    {fmtStack(value)}
                                  </text>
                                )}
                                {/* Total encima */}
                                <text
                                  x={x + width / 2}
                                  y={y - 22}
                                  fill="#1e40af"
                                  textAnchor="middle"
                                  fontSize={13}
                                  fontWeight={700}
                                >
                                  {fmtStack(total)}
                                </text>
                                {/* Ops debajo del total */}
                                <text
                                  x={x + width / 2}
                                  y={y - 6}
                                  fill="#1e40af"
                                  textAnchor="middle"
                                  fontSize={12}
                                  fontWeight={700}
                                >
                                  {ops} ops
                                </text>
                              </g>
                            );
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Sección 2b: Proceso con Suspensión ── */}
        <section>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Proceso con Suspensión — Registro → Confirmación
          </p>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="pt-6 px-2 pb-4">
              <div style={{ width: "100%", height: 380 }}>
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dataBarrasSuspension}
                      margin={{ top: 48, right: 32, left: 8, bottom: 0 }}
                      barCategoryGap="70%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="mes"
                        tick={{ fontSize: 13, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `${v}hs`}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          fmtStack(v),
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          border: "none",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 13, paddingTop: 16 }} />

                      {/* Amarillo abajo: Reg → Susp */}
                      <Bar dataKey="Reg → Susp" stackId="b" fill="#FFE066">
                        <LabelList
                          content={(props: any) => {
                            const { x, y, width, height, value } = props;
                            if (!value || height < 16) return null;
                            return (
                              <text
                                x={x + width / 2}
                                y={y + height / 2 + 5}
                                fill="#1e293b"
                                textAnchor="middle"
                                fontSize={13}
                                fontWeight={700}
                              >
                                {fmtStack(value)}
                              </text>
                            );
                          }}
                        />
                      </Bar>

                      {/* Gris arriba: Susp → Conf */}
                      <Bar
                        dataKey="Susp → Conf"
                        stackId="b"
                        fill="#999999"
                        radius={[4, 4, 0, 0]}
                      >
                        <LabelList
                          content={(props: any) => {
                            const { x, y, width, height, value, index } = props;
                            const d = dataBarrasSuspension[index];
                            const total = d["Reg → Susp"] + d["Susp → Conf"];
                            const ops = d.ops;
                            return (
                              <g>
                                {value && height >= 16 && (
                                  <text
                                    x={x + width / 2}
                                    y={y + height / 2 + 5}
                                    fill="#ffffff"
                                    textAnchor="middle"
                                    fontSize={13}
                                    fontWeight={700}
                                  >
                                    {fmtStack(value)}
                                  </text>
                                )}
                                <text
                                  x={x + width / 2}
                                  y={y - 22}
                                  fill="#1e40af"
                                  textAnchor="middle"
                                  fontSize={13}
                                  fontWeight={700}
                                >
                                  {fmtStack(total)}
                                </text>
                                <text
                                  x={x + width / 2}
                                  y={y - 6}
                                  fill="#1e40af"
                                  textAnchor="middle"
                                  fontSize={12}
                                  fontWeight={700}
                                >
                                  {ops} ops
                                </text>
                              </g>
                            );
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Sección 3: Barras por prioridad ── */}
        <section>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Tiempos entre Etapas — Registro → Cierre
          </p>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="pt-6 px-2 pb-4">
              <div style={{ width: "100%", height: 380 }}>
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dataBarrasPrioridad}
                      margin={{ top: 48, right: 32, left: 8, bottom: 0 }}
                      barCategoryGap="70%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="prioridad"
                        tick={{ fontSize: 13, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `${v}hs`}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        label={{
                          value: "Tiempo Promedio (horas)",
                          angle: -90,
                          position: "insideLeft",
                          offset: 10,
                          style: { fontSize: 11, fill: "#94a3b8" },
                        }}
                      />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          hToHHMM(v),
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          border: "none",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Legend />

                      {/* Amarillo — Reg → Conf */}
                      <Bar
                        dataKey="Reg → Conf"
                        stackId="p"
                        fill="#F5C842"
                        isAnimationActive={false}
                      >
                        <LabelList
                          dataKey="Reg → Conf"
                          position="center"
                          formatter={(v: number) => (v > 0.8 ? hToHHMM(v) : "")}
                          style={{
                            fill: "#1a1a1a",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        />
                      </Bar>

                      {/* Gris medio — Conf → Arm */}
                      <Bar
                        dataKey="Conf → Arm"
                        stackId="p"
                        fill="#888888"
                        isAnimationActive={false}
                      >
                        <LabelList
                          dataKey="Conf → Arm"
                          position="center"
                          formatter={(v: number) => (v > 0.8 ? hToHHMM(v) : "")}
                          style={{
                            fill: "#ffffff",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        />
                      </Bar>

                      {/* Gris claro — Arm → Cierre */}
                      <Bar
                        dataKey="Arm → Cierre"
                        stackId="p"
                        fill="#BBBBBB"
                        isAnimationActive={false}
                      >
                        <LabelList
                          dataKey="Arm → Cierre"
                          position="center"
                          formatter={(v: number) => (v > 0.8 ? hToHHMM(v) : "")}
                          style={{
                            fill: "#1a1a1a",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        />
                        {/* Label total azul arriba */}
                        <LabelList
                          content={(props: any) => {
                            const { x, y, width, index } = props;
                            const d = dataBarrasPrioridad[index];
                            if (!d) return null;
                            return (
                              <text
                                x={x + width / 2}
                                y={y - 8}
                                textAnchor="middle"
                                fill="#1e3a8a"
                                fontWeight={700}
                                fontSize={13}
                              >
                                <tspan x={x + width / 2} dy="0">
                                  {hToHHMM(d.total)}
                                </tspan>
                                <tspan x={x + width / 2} dy="16">
                                  {d.ops} ops
                                </tspan>
                              </text>
                            );
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Sección 4: Tabla prioridades ── */}
        <section>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Detalle por prioridad
          </p>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="pt-2">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100">
                    <TableHead className="text-slate-500 text-xs uppercase tracking-wide">
                      Prioridad
                    </TableHead>
                    <TableHead className="text-slate-500 text-xs uppercase tracking-wide text-right">
                      Operaciones
                    </TableHead>
                    <TableHead className="text-slate-500 text-xs uppercase tracking-wide text-right">
                      Tiempo promedio
                    </TableHead>
                    <TableHead className="text-slate-500 text-xs uppercase tracking-wide text-right">
                      %
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prioridades.map((p) => (
                    <TableRow
                      key={p.Prioridad}
                      className="border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${PRIORIDAD_COLOR[p.Prioridad] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          P{p.Prioridad}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-700">
                        {p.cantidad.toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-600">
                        {p["Tiempo Promedio"]}
                      </TableCell>
                      <TableCell className="text-right text-slate-500 text-sm">
                        {((p.cantidad / totalOps) * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
