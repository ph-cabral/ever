"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Users, User, CalendarDays, CalendarRange, Calendar,
  Loader2, RefreshCw, AlertTriangle, type LucideIcon,
} from "lucide-react";
import {
  PageTitle, SectionTitle, Panel, KPI, Grid, ChartBar, ChartDonut, Table,
  fmtNum, fmtMes, C,
} from "../components/ui";

// ──────────────────────────────────────────────────────────────────────────────
// Pedidos preparados — REAL desde WMS (proceso Picking) vía /api/deposito/wms.
// 1 fila = 1 OT. "Preparados" = OTs; "Ítems" = CANT. ITEM RECOLECTADOS.
// Réplica de picking_semanal.html, con Día / Semana / Mes + comparativa/individual.
// ──────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
interface Rec { d: Date; op: string; items: number }
type Gran = "dia" | "sem" | "mes";
type Vista = "comp" | "ind";

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDM = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
const clip = (s: string, n = 18) => (s.length > n ? s.slice(0, n) + "…" : s);
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// ISO-8601 week (lun→dom), igual que picking_semanal.html
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const w = 1 + Math.round((+t - +firstThu) / 86400000 / 7);
  return { year: t.getUTCFullYear(), week: w };
}
function mondayOf(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function bucketOf(d: Date, g: Gran): { key: string; sort: string; label: string } {
  if (g === "dia") { const k = iso(d); return { key: k, sort: k, label: fmtDM(d) }; }
  if (g === "mes") { const k = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; return { key: k, sort: k, label: fmtMes(k) }; }
  const iw = isoWeek(d);
  const k = `${iw.year}-W${pad2(iw.week)}`;
  return { key: k, sort: k, label: `Sem ${iw.week} · ${fmtDM(mondayOf(d))}` };
}

function parseRow(r: Row): Rec | null {
  const raw = String(r["FECHA EJECUCION"] ?? "").trim().split(" ")[0];
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (isNaN(d.getTime())) return null;
  const op = String(r["OPERARIO"] ?? "").trim() || "(sin operario)";
  const items = parseInt(String(r["CANT. ITEM RECOLECTADOS"] ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
  return { d, op, items };
}

// ─── Toggle de botones (estética EVER WEAR) ───────────────────────────────────
function Seg<T extends string>({
  opts, val, onChange,
}: { opts: { v: T; label: string; icon: LucideIcon }[]; val: T; onChange: (v: T) => void }) {
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
              active ? "bg-yellow-400 text-black font-semibold" : "bg-[#1f1f1f] text-zinc-400 hover:text-zinc-100"
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

interface RankRow { op: string; ots: number; items: number }
interface BucketRow { lbl: string; ots: number; items: number }

export default function PedidosPreparadosPage() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [vista, setVista] = useState<Vista>("comp");
  const [gran, setGran] = useState<Gran>("sem");
  const [op, setOp] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default: últimas ~10 semanas → hoy (cliente, evita mismatch SSR).
  useEffect(() => {
    const t = new Date();
    setHasta(iso(t));
    setDesde(iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 70)));
  }, []);

  useEffect(() => {
    if (!desde || !hasta) return;
    let cancel = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await fetch(`/api/deposito/wms?desde=${desde}&hasta=${hasta}`, { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { rows?: Row[]; error?: string };
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (!cancel) setRows((j.rows ?? []).filter((x) => String(x["PROCESO"] ?? "") === "Picking"));
      } catch (e) {
        if (!cancel) { setError(e instanceof Error ? e.message : "Error al cargar"); setRows([]); }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [desde, hasta]);

  const recs = useMemo(() => (rows ?? []).map(parseRow).filter((x): x is Rec => x !== null), [rows]);
  const granLabel = gran === "mes" ? "mes" : gran === "sem" ? "semana" : "día";

  // Agregados
  const { ranking, buckets, perOpBucket, totOts, totItems } = useMemo(() => {
    const opTot = new Map<string, { ots: number; items: number }>();
    const bk = new Map<string, { label: string; sort: string; ots: number; items: number }>();
    const opBk = new Map<string, Map<string, { ots: number; items: number }>>();
    for (const r of recs) {
      const b = bucketOf(r.d, gran);
      const ot = opTot.get(r.op) ?? { ots: 0, items: 0 }; ot.ots++; ot.items += r.items; opTot.set(r.op, ot);
      const bb = bk.get(b.key) ?? { label: b.label, sort: b.sort, ots: 0, items: 0 }; bb.ots++; bb.items += r.items; bk.set(b.key, bb);
      let m = opBk.get(r.op); if (!m) { m = new Map(); opBk.set(r.op, m); }
      const c = m.get(b.key) ?? { ots: 0, items: 0 }; c.ots++; c.items += r.items; m.set(b.key, c);
    }
    const ranking: RankRow[] = [...opTot.entries()].map(([o, v]) => ({ op: o, ots: v.ots, items: v.items })).sort((a, b) => b.ots - a.ots);
    const buckets = [...bk.values()].sort((a, b) => a.sort.localeCompare(b.sort));
    return { ranking, buckets, perOpBucket: opBk, totOts: recs.length, totItems: recs.reduce((a, r) => a + r.items, 0) };
  }, [recs, gran]);

  // Mantener un operario válido seleccionado
  useEffect(() => {
    if (ranking.length && !ranking.some((r) => r.op === op)) setOp(ranking[0].op);
  }, [ranking, op]);

  const angle = gran === "mes" ? 0 : -35;
  const reload = () => { const h = hasta; setHasta(""); setTimeout(() => setHasta(h), 0); };

  // Comparativa
  const bucketSerie: BucketRow[] = buckets.map((b) => ({ lbl: b.label, ots: b.ots, items: b.items }));
  const rankingData = ranking.map((r) => ({ op: clip(r.op), ots: r.ots }));

  // Individual
  const suBuckets: BucketRow[] = buckets.map((b) => {
    const c = perOpBucket.get(op)?.get(b.key);
    return { lbl: b.label, ots: c?.ots ?? 0, items: c?.items ?? 0 };
  });
  const suOts = suBuckets.reduce((a, x) => a + x.ots, 0);
  const suItems = suBuckets.reduce((a, x) => a + x.items, 0);
  const promOts = buckets.length ? suOts / buckets.length : 0;
  const puesto = ranking.findIndex((r) => r.op === op) + 1;
  const aporte = [
    { name: clip(op), value: suOts, color: C.brand },
    { name: "Resto del equipo", value: Math.max(0, totOts - suOts), color: "#3f3f46" },
  ];

  const hayDatos = recs.length > 0;

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {(loading || error) && (
        <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2">
          {loading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" /> Consultando la base…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300">
              <AlertTriangle size={16} className="text-red-400" /> {error}
            </div>
          )}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <PageTitle
            title="Pedidos preparados"
            sub="Productividad de preparadores — proceso Picking · OTs e ítems · Depósito Central"
          />
          <div className="flex items-center gap-2 flex-wrap mt-1 text-sm">
            <label className="flex items-center gap-1.5 text-zinc-400">
              Desde
              <input type="date" value={desde} max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
                className="bg-[#1f1f1f] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-yellow-400 outline-none cursor-pointer" />
            </label>
            <label className="flex items-center gap-1.5 text-zinc-400">
              Hasta
              <input type="date" value={hasta} min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
                className="bg-[#1f1f1f] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-yellow-400 outline-none cursor-pointer" />
            </label>
            <button onClick={reload} title="Refrescar" disabled={loading}
              className="text-zinc-400 hover:text-yellow-400 transition-colors p-2 disabled:opacity-40">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-4">
          <Seg<Vista> val={vista} onChange={setVista}
            opts={[{ v: "comp", label: "Comparativa", icon: Users }, { v: "ind", label: "Individual", icon: User }]} />
          <Seg<Gran> val={gran} onChange={setGran}
            opts={[
              { v: "dia", label: "Diario", icon: CalendarDays },
              { v: "sem", label: "Semanal", icon: CalendarRange },
              { v: "mes", label: "Mensual", icon: Calendar },
            ]} />
          {vista === "ind" && (
            <select value={op} onChange={(e) => setOp(e.target.value)}
              className="bg-[#1f1f1f] border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:border-yellow-400 outline-none cursor-pointer max-w-[200px]">
              {ranking.map((r) => <option key={r.op} value={r.op}>{r.op}</option>)}
            </select>
          )}
        </div>

        {!hayDatos ? (
          <div className="flex flex-col items-center justify-center py-28 gap-3 text-center">
            {loading ? <Loader2 size={40} className="text-yellow-400 animate-spin" />
              : <CalendarRange size={44} className="text-zinc-700" />}
            <p className="text-zinc-400 font-medium">
              {loading ? "Consultando la base…" : "Sin OTs de Picking en el rango seleccionado"}
            </p>
            {!loading && <p className="text-zinc-600 text-sm">Ajustá Desde / Hasta y reintentá.</p>}
          </div>
        ) : vista === "comp" ? (
          <>
            <Grid cols={4}>
              <KPI label="OTs preparadas" value={fmtNum(totOts)} sub={`${buckets.length} ${granLabel}s`} accent="yellow" />
              <KPI label="Ítems recolectados" value={fmtNum(totItems)} accent="green" />
              <KPI label="Preparadores" value={fmtNum(ranking.length)} sub="activos en el período" accent="neutral" />
              <KPI label={`Prom. OTs / ${granLabel}`} value={fmtNum(buckets.length ? totOts / buckets.length : 0, 1)} accent="amber" />
            </Grid>

            <SectionTitle>Ranking de preparadores — OTs en el período</SectionTitle>
            <Panel>
              <ChartBar data={rankingData} xKey="op" height={Math.max(220, ranking.length * 34)} horizontal
                series={[{ key: "ots", name: "OTs", color: C.brand }]} fmt={(n) => fmtNum(n)} showValues />
            </Panel>

            <SectionTitle>OTs por {granLabel} (todo el equipo)</SectionTitle>
            <Panel>
              <ChartBar data={bucketSerie} xKey="lbl" height={300}
                series={[{ key: "ots", name: "OTs", color: C.brand }]} fmt={(n) => fmtNum(n)} angle={angle} showValues />
            </Panel>

            <SectionTitle>Detalle por preparador</SectionTitle>
            <Table<RankRow>
              cols={[
                { key: "op", label: "Preparador" },
                { key: "ots", label: "OTs", num: true, render: (r) => fmtNum(r.ots) },
                { key: "items", label: "Ítems", num: true, render: (r) => fmtNum(r.items) },
                { key: "otsb", label: `OTs/${granLabel}`, num: true, render: (r) => fmtNum(buckets.length ? r.ots / buckets.length : 0, 1) },
                { key: "ipo", label: "Ítems/OT", num: true, render: (r) => fmtNum(r.ots ? r.items / r.ots : 0, 1) },
              ]}
              rows={ranking} max={50} maxH={460}
            />
          </>
        ) : (
          <>
            <Grid cols={4}>
              <KPI label="OTs en el período" value={fmtNum(suOts)} sub={`${buckets.length} ${granLabel}s`} accent="yellow" />
              <KPI label="Ítems recolectados" value={fmtNum(suItems)} accent="green" />
              <KPI label={`Prom. OTs / ${granLabel}`} value={fmtNum(promOts, 1)} accent="neutral" />
              <KPI label="Puesto en ranking" value={puesto > 0 ? `${puesto}º` : "—"} sub={`de ${ranking.length}`} accent="amber" />
            </Grid>

            <SectionTitle>Progreso de {op} — OTs por {granLabel}</SectionTitle>
            <Panel>
              <ChartBar data={suBuckets} xKey="lbl" height={300}
                series={[{ key: "ots", name: "OTs", color: C.brand }]} fmt={(n) => fmtNum(n)} angle={angle} showValues />
            </Panel>

            <SectionTitle>Ítems recolectados por {granLabel}</SectionTitle>
            <Panel>
              <ChartBar data={suBuckets} xKey="lbl" height={240}
                series={[{ key: "items", name: "Ítems", color: C.green }]} fmt={(n) => fmtNum(n)} angle={angle} showValues />
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Panel title="Aporte al total del período" accent={`(${clip(op)})`}>
                <ChartDonut data={aporte} height={280} fmt={(n) => fmtNum(n)} />
              </Panel>
              <Panel title={`Detalle por ${granLabel}`} accent={`(${clip(op)})`}>
                <Table<BucketRow>
                  cols={[
                    { key: "lbl", label: granLabel },
                    { key: "ots", label: "OTs", num: true, render: (r) => fmtNum(r.ots) },
                    { key: "items", label: "Ítems", num: true, render: (r) => fmtNum(r.items) },
                    { key: "ipo", label: "Ítems/OT", num: true, render: (r) => fmtNum(r.ots ? r.items / r.ots : 0, 1) },
                  ]}
                  rows={suBuckets} max={60} maxH={320}
                />
              </Panel>
            </div>
          </>
        )}

        <p className="text-[11px] text-zinc-600 mt-6 leading-relaxed">
          Datos reales del WMS (proceso Picking) vía SQL en vivo. 1 OT = 1 fila; «Ítems» = ítems recolectados.
          Semanas lunes→domingo (ISO).
        </p>
      </main>
    </div>
  );
}
