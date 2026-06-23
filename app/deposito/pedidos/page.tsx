"use client";

import { useState, useMemo } from "react";
import { Users, User, CalendarDays, CalendarRange, type LucideIcon } from "lucide-react";
import {
  PageTitle,
  SectionTitle,
  Panel,
  KPI,
  Grid,
  ChartBar,
  ChartDonut,
  fmtNum,
  C,
  type Serie,
} from "../components/ui";

// ──────────────────────────────────────────────────────────────────────────────
// MOCK — datos reales WMS (proceso Picking, OTs) dic-2025 → jun-2026.
// "Preparados" es real; "Ingresados" se calcula como demo (ver ingDemo).
// TODO: reemplazar este bloque por un fetch a /api/deposito/preparadores.
// ──────────────────────────────────────────────────────────────────────────────
type OpMap = Record<string, number>;
interface Punto {
  lbl: string;
  prep: number;
  op: OpMap;
}
interface OpInfo {
  op: string;
  ots: number;
  items: number;
  horas: number;
  iph: number;
  otsdia: number;
}

const TOP: string[] = [
  "Caceres Nicolas",
  "Rios Ivan",
  "Maidana Maximiliano",
  "Aramayo Marcelo",
  "Ortiz Ariel",
  "Scarpello Rodolfo",
  "Corzo Agustin",
  "Boscacci Vladimir",
];

const OPERARIOS: OpInfo[] = [
  { op: "Caceres Nicolas", ots: 2372, items: 34401, horas: 9438.9, iph: 3.6, otsdia: 22.6 },
  { op: "Rios Ivan", ots: 2304, items: 50416, horas: 11631.7, iph: 4.3, otsdia: 18.6 },
  { op: "Maidana Maximiliano", ots: 1776, items: 44489, horas: 9779.3, iph: 4.5, otsdia: 14.7 },
  { op: "Aramayo Marcelo", ots: 1681, items: 45919, horas: 12287.9, iph: 3.7, otsdia: 12.9 },
  { op: "Ortiz Ariel", ots: 1347, items: 17849, horas: 2800.8, iph: 6.4, otsdia: 11.6 },
  { op: "Scarpello Rodolfo", ots: 1203, items: 8874, horas: 3609.0, iph: 2.5, otsdia: 13.7 },
  { op: "Corzo Agustin", ots: 469, items: 4974, horas: 1651.6, iph: 3.0, otsdia: 13.0 },
  { op: "Boscacci Vladimir", ots: 442, items: 7991, horas: 2181.1, iph: 3.7, otsdia: 13.8 },
];

const MESES: Punto[] = [
  { lbl: "Dic 25", prep: 1727, op: { "Caceres Nicolas": 0, "Rios Ivan": 289, "Maidana Maximiliano": 345, "Aramayo Marcelo": 319, "Ortiz Ariel": 221, "Scarpello Rodolfo": 34, "Corzo Agustin": 62, "Boscacci Vladimir": 306 } },
  { lbl: "Ene 26", prep: 1747, op: { "Caceres Nicolas": 219, "Rios Ivan": 425, "Maidana Maximiliano": 210, "Aramayo Marcelo": 271, "Ortiz Ariel": 206, "Scarpello Rodolfo": 254, "Corzo Agustin": 19, "Boscacci Vladimir": 136 } },
  { lbl: "Feb 26", prep: 1511, op: { "Caceres Nicolas": 311, "Rios Ivan": 334, "Maidana Maximiliano": 134, "Aramayo Marcelo": 230, "Ortiz Ariel": 144, "Scarpello Rodolfo": 167, "Corzo Agustin": 130, "Boscacci Vladimir": 0 } },
  { lbl: "Mar 26", prep: 1884, op: { "Caceres Nicolas": 475, "Rios Ivan": 318, "Maidana Maximiliano": 256, "Aramayo Marcelo": 297, "Ortiz Ariel": 188, "Scarpello Rodolfo": 223, "Corzo Agustin": 102, "Boscacci Vladimir": 0 } },
  { lbl: "Abr 26", prep: 1952, op: { "Caceres Nicolas": 547, "Rios Ivan": 352, "Maidana Maximiliano": 338, "Aramayo Marcelo": 233, "Ortiz Ariel": 244, "Scarpello Rodolfo": 220, "Corzo Agustin": 13, "Boscacci Vladimir": 0 } },
  { lbl: "May 26", prep: 1866, op: { "Caceres Nicolas": 411, "Rios Ivan": 363, "Maidana Maximiliano": 253, "Aramayo Marcelo": 200, "Ortiz Ariel": 253, "Scarpello Rodolfo": 246, "Corzo Agustin": 140, "Boscacci Vladimir": 0 } },
  { lbl: "Jun 26", prep: 1156, op: { "Caceres Nicolas": 409, "Rios Ivan": 223, "Maidana Maximiliano": 240, "Aramayo Marcelo": 131, "Ortiz Ariel": 91, "Scarpello Rodolfo": 59, "Corzo Agustin": 3, "Boscacci Vladimir": 0 } },
];

const DIAS: Punto[] = [
  { lbl: "02/06", prep: 90, op: { "Caceres Nicolas": 23, "Rios Ivan": 23, "Maidana Maximiliano": 14, "Aramayo Marcelo": 10, "Ortiz Ariel": 2, "Scarpello Rodolfo": 18, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "03/06", prep: 82, op: { "Caceres Nicolas": 35, "Rios Ivan": 15, "Maidana Maximiliano": 13, "Aramayo Marcelo": 14, "Ortiz Ariel": 1, "Scarpello Rodolfo": 3, "Corzo Agustin": 1, "Boscacci Vladimir": 0 } },
  { lbl: "04/06", prep: 72, op: { "Caceres Nicolas": 24, "Rios Ivan": 19, "Maidana Maximiliano": 14, "Aramayo Marcelo": 14, "Ortiz Ariel": 1, "Scarpello Rodolfo": 0, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "05/06", prep: 58, op: { "Caceres Nicolas": 24, "Rios Ivan": 13, "Maidana Maximiliano": 13, "Aramayo Marcelo": 8, "Ortiz Ariel": 0, "Scarpello Rodolfo": 0, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "08/06", prep: 83, op: { "Caceres Nicolas": 39, "Rios Ivan": 0, "Maidana Maximiliano": 12, "Aramayo Marcelo": 16, "Ortiz Ariel": 13, "Scarpello Rodolfo": 3, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "09/06", prep: 80, op: { "Caceres Nicolas": 38, "Rios Ivan": 0, "Maidana Maximiliano": 18, "Aramayo Marcelo": 16, "Ortiz Ariel": 8, "Scarpello Rodolfo": 0, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "10/06", prep: 100, op: { "Caceres Nicolas": 27, "Rios Ivan": 0, "Maidana Maximiliano": 26, "Aramayo Marcelo": 14, "Ortiz Ariel": 15, "Scarpello Rodolfo": 18, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "11/06", prep: 80, op: { "Caceres Nicolas": 18, "Rios Ivan": 20, "Maidana Maximiliano": 19, "Aramayo Marcelo": 11, "Ortiz Ariel": 10, "Scarpello Rodolfo": 2, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "12/06", prep: 57, op: { "Caceres Nicolas": 17, "Rios Ivan": 12, "Maidana Maximiliano": 10, "Aramayo Marcelo": 11, "Ortiz Ariel": 7, "Scarpello Rodolfo": 0, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "16/06", prep: 68, op: { "Caceres Nicolas": 20, "Rios Ivan": 20, "Maidana Maximiliano": 20, "Aramayo Marcelo": 0, "Ortiz Ariel": 8, "Scarpello Rodolfo": 0, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "17/06", prep: 75, op: { "Caceres Nicolas": 30, "Rios Ivan": 26, "Maidana Maximiliano": 17, "Aramayo Marcelo": 1, "Ortiz Ariel": 1, "Scarpello Rodolfo": 0, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "18/06", prep: 63, op: { "Caceres Nicolas": 37, "Rios Ivan": 17, "Maidana Maximiliano": 6, "Aramayo Marcelo": 2, "Ortiz Ariel": 1, "Scarpello Rodolfo": 0, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "19/06", prep: 71, op: { "Caceres Nicolas": 24, "Rios Ivan": 21, "Maidana Maximiliano": 26, "Aramayo Marcelo": 0, "Ortiz Ariel": 0, "Scarpello Rodolfo": 0, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
  { lbl: "22/06", prep: 70, op: { "Caceres Nicolas": 16, "Rios Ivan": 23, "Maidana Maximiliano": 22, "Aramayo Marcelo": 0, "Ortiz Ariel": 9, "Scarpello Rodolfo": 0, "Corzo Agustin": 0, "Boscacci Vladimir": 0 } },
];

// Ingresados demo (placeholder). En producción saldrá de Magnos (pedidos registrados).
const ingDemo = (p: number, i: number) => Math.round(p * (1.05 + ((i * 3 + 2) % 9) / 100));

const ZINC = "#9ca3af";

// ─── Toggle de botones (estética EVER WEAR) ───────────────────────────────────
function Seg<T extends string>({
  opts,
  val,
  onChange,
}: {
  opts: { v: T; label: string; icon: LucideIcon }[];
  val: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-700 overflow-hidden">
      {opts.map((o) => {
        const active = o.v === val;
        const Icon = o.icon;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm transition-colors ${
              active
                ? "bg-yellow-400 text-black font-semibold"
                : "bg-[#1f1f1f] text-zinc-400 hover:text-zinc-100"
            }`}
          >
            <Icon size={15} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function PedidosPreparadosPage() {
  const [vista, setVista] = useState<"comp" | "ind">("comp");
  const [gran, setGran] = useState<"dia" | "mes">("mes");
  const [op, setOp] = useState<string>(TOP[0]);

  const serie = gran === "mes" ? MESES : DIAS;
  const granLabel = gran === "mes" ? "mes" : "día";

  // Ranking de preparadores en el rango visible
  const ranking = useMemo(() => {
    return TOP.map((name) => ({
      op: name,
      v: serie.reduce((a, p) => a + (p.op[name] ?? 0), 0),
    }))
      .filter((r) => r.v > 0)
      .sort((a, b) => b.v - a.v);
  }, [serie]);

  const totPrep = useMemo(() => serie.reduce((a, p) => a + p.prep, 0), [serie]);
  const totIng = useMemo(
    () => serie.reduce((a, p, i) => a + ingDemo(p.prep, i), 0),
    [serie],
  );
  const pct = totIng > 0 ? Math.round((totPrep / totIng) * 100) : 0;

  // Serie temporal: ingresados vs preparados
  const temporal = serie.map((p, i) => ({
    lbl: p.lbl,
    prep: p.prep,
    ing: ingDemo(p.prep, i),
  }));
  const tSeries: Serie[] = [
    { key: "prep", name: "Preparados", color: C.brand },
    { key: "ing", name: "Ingresados (demo)", color: ZINC },
  ];

  // Individual
  const info = OPERARIOS.find((o) => o.op === op) ?? OPERARIOS[0];
  const suSerie = serie.map((p) => ({ lbl: p.lbl, v: p.op[op] ?? 0 }));
  const suTot = suSerie.reduce((a, p) => a + p.v, 0);
  const prom = Math.round((suTot / serie.length) * 10) / 10;
  const puesto = ranking.findIndex((r) => r.op === op) + 1;
  const aporte = [
    { name: op, value: suTot, color: C.brand },
    { name: "Resto del equipo", value: Math.max(0, totPrep - suTot), color: "#3f3f46" },
  ];

  const angle = gran === "dia" ? -35 : 0;

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <PageTitle
            title="Pedidos preparados"
            sub="Productividad de preparadores — proceso Picking · Depósito Central"
          />
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <Seg<"comp" | "ind">
              val={vista}
              onChange={setVista}
              opts={[
                { v: "comp", label: "Comparativa", icon: Users },
                { v: "ind", label: "Individual", icon: User },
              ]}
            />
            <Seg<"dia" | "mes">
              val={gran}
              onChange={setGran}
              opts={[
                { v: "dia", label: "Diario", icon: CalendarDays },
                { v: "mes", label: "Mensual", icon: CalendarRange },
              ]}
            />
            {vista === "ind" && (
              <select
                value={op}
                onChange={(e) => setOp(e.target.value)}
                className="bg-[#1f1f1f] border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:border-yellow-400 outline-none cursor-pointer"
              >
                {OPERARIOS.map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.op}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {vista === "comp" ? (
          <>
            <Grid cols={4}>
              <KPI
                label="Preparados (OTs)"
                value={fmtNum(totPrep)}
                sub={gran === "mes" ? `${serie.length} meses` : `${serie.length} días`}
                accent="yellow"
              />
              <KPI label="Ingresados (demo)" value={fmtNum(totIng)} sub="provisorio" accent="neutral" />
              <KPI
                label="% cumplido"
                value={`${pct} %`}
                sub="preparado / ingresado"
                accent={pct >= 95 ? "green" : "amber"}
              />
              <KPI label="Preparadores" value={fmtNum(ranking.length)} sub="activos en el período" accent="amber" />
            </Grid>

            <SectionTitle>Ranking de preparadores — OTs en el período</SectionTitle>
            <Panel>
              <ChartBar
                data={ranking}
                xKey="op"
                height={320}
                horizontal
                series={[{ key: "v", name: "OTs preparadas", color: C.brand }]}
                fmt={(n) => fmtNum(n)}
                showValues
              />
            </Panel>

            <SectionTitle>Ingresados vs preparados por {granLabel}</SectionTitle>
            <Panel>
              <ChartBar
                data={temporal}
                xKey="lbl"
                height={300}
                series={tSeries}
                fmt={(n) => fmtNum(n)}
                angle={angle}
              />
            </Panel>
          </>
        ) : (
          <>
            <Grid cols={4}>
              <KPI
                label={`OTs en el período`}
                value={fmtNum(suTot)}
                sub={gran === "mes" ? `${serie.length} meses` : `${serie.length} días`}
                accent="yellow"
              />
              <KPI label={`Promedio por ${granLabel}`} value={fmtNum(prom, 1)} accent="green" />
              <KPI label="Ítems / hora" value={fmtNum(info.iph, 1)} sub="histórico" accent="neutral" />
              <KPI
                label="Puesto en ranking"
                value={puesto > 0 ? `${puesto}º` : "—"}
                sub={`de ${ranking.length}`}
                accent="amber"
              />
            </Grid>

            <SectionTitle>Progreso de {op} — OTs por {granLabel}</SectionTitle>
            <Panel>
              <ChartBar
                data={suSerie}
                xKey="lbl"
                height={300}
                series={[{ key: "v", name: "OTs", color: C.brand }]}
                fmt={(n) => fmtNum(n)}
                angle={angle}
                showValues
              />
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Panel title="Aporte al total del período" accent={`(${op})`}>
                <ChartDonut data={aporte} height={280} fmt={(n) => fmtNum(n)} />
              </Panel>
              <Panel title="Resumen histórico" accent={`(${op})`}>
                <div className="grid grid-cols-2 gap-3">
                  <KPI label="OTs totales" value={fmtNum(info.ots)} accent="yellow" />
                  <KPI label="Ítems totales" value={fmtNum(info.items)} accent="green" />
                  <KPI label="Horas trabajadas" value={fmtNum(info.horas, 0)} accent="neutral" />
                  <KPI label="OTs por día" value={fmtNum(info.otsdia, 1)} accent="amber" />
                </div>
              </Panel>
            </div>
          </>
        )}

        <p className="text-[11px] text-zinc-600 mt-6 leading-relaxed">
          Preparados = datos reales del WMS (proceso Picking, OTs). Ingresados = valor provisorio de
          demostración; en producción saldrá de Magnos (pedidos registrados ese día). Reemplazar el bloque MOCK
          por un fetch al endpoint de datos.
        </p>
      </main>
    </div>
  );
}
