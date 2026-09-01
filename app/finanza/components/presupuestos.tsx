"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import {
  PageTitle,
  SectionTitle,
  Panel,
  KPI,
  Grid,
  Alert,
  Progress,
  ChartBar,
  ChartDonut,
  PALETTE,
  fmtArs,
  fmtNum,
  fmtShort,
  fmtMes,
  MatrixTable,
  type MatRow,
} from "./ui";

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Presupuestos" de /finanza — ÓRDENES DE COMPRA POR ÁREA (2026-09-01)
//
// Los "presupuestos por área" de compras SON órdenes de compra: el área es el
// TIPO DE COMPROBANTE con el que se cargó la OC (ORDEN DE COMPRA nacional ·
// IMPO · INDUSTRIA · RRHH · MARKETING · SISTEMAS IT · INGRESO INDUSTRIA A
// COMERCIAL). Antes esta pestaña se armaba de una hoja del Excel financiero
// que se sube a mano; ahora lee la base en vivo
// (/api/finanza/presupuestos → indicadores-api /compras/oc-por-area).
//
// Por eso es la ÚNICA pestaña de /finanza que anda sin Excel cargado: se pide
// sola al montar y tiene su propio selector de MESES (no de días: una OC se
// mira por mes). Default = mes en curso.
//
// Los importes están PESIFICADOS a la cotización de cada OC (las de impo van
// en U$S; un total que mezcla monedas no significa nada). Las OC CANCELADAS
// quedan fuera de todos los totales y se informan al pie.
// ─────────────────────────────────────────────────────────────────────────────

type Acum = {
  items: number;
  ocs: number;
  unidadesPedidas: number;
  unidadesCumplidas: number;
  importe: number;
  importeCumplido: number;
  importePendiente: number;
  importeMonOrig: number;
  importeUsd: number;
};
type EstadoAcum = Acum & { estado: number; nombre: string };
type AreaAcum = Acum & { codigo: number; area: string; estados: EstadoAcum[] };
export type OcPorArea = {
  desde: string;
  hasta: string;
  resumen: Acum;
  canceladas: Acum;
  estadosVista: number[];
  porEstado: EstadoAcum[];
  areas: AreaAcum[];
  compradores: (Acum & { codigo: number; comprador: string })[];
  meses: (Acum & { mes: string })[];
};

const EST_PENDIENTE = 1;
const EST_CUMPLIDA = 2;
const EST_PARCIAL = 3;
const COLOR_ESTADO: Record<number, string> = {
  1: "#f87171", // pendiente de recibir
  2: "#4ade80", // cumplida
  3: "#facc15", // cumplida parcialmente
  0: "#a1a1aa", // sin confirmar
  5: "#71717a", // eliminada
};

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const clip = (s: string, n = 22) => (s.length > n ? s.slice(0, n) + "…" : s);
const est = (a: AreaAcum, cod: number) => a.estados.find((e) => e.estado === cod);
const pct = (parte: number, total: number) =>
  total > 0 ? (parte / total) * 100 : 0;

export function PresupuestosTab() {
  const [desde, setDesde] = useState(mesActual);
  const [hasta, setHasta] = useState(mesActual);
  const [d, setD] = useState<OcPorArea | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (dsd: string, hst: string) => {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ desde: dsd, hasta: hst });
      const res = await fetch(`/api/finanza/presupuestos?${qs}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "No se pudieron traer las OC");
      setD(json as OcPorArea);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setD(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(desde, hasta);
  }, [cargar, desde, hasta]);

  const vista = useMemo(() => {
    if (!d) return null;
    const r = d.resumen;
    const porEstado = new Map(d.porEstado.map((e) => [e.estado, e]));
    const cumpl = porEstado.get(EST_CUMPLIDA);
    const pend = porEstado.get(EST_PENDIENTE);
    const parcial = porEstado.get(EST_PARCIAL);

    const donut = d.porEstado.map((e) => ({
      name: `${e.nombre} (${fmtNum(e.items)})`,
      value: e.items,
      color: COLOR_ESTADO[e.estado] ?? PALETTE[e.estado % PALETTE.length],
    }));

    // Barras: una por área × estado, apiladas — es la lectura del mockup
    // ("cumplido vs pendiente" dentro de cada área) en un solo gráfico.
    const barras = d.areas.map((a) => ({
      area: clip(a.area, 20),
      Cumplida: est(a, EST_CUMPLIDA)?.importe ?? 0,
      Pendiente: est(a, EST_PENDIENTE)?.importe ?? 0,
      Parcial: est(a, EST_PARCIAL)?.importe ?? 0,
    }));

    const rows: MatRow[] = d.areas.map((a) => {
      const p = est(a, EST_PENDIENTE);
      const c = est(a, EST_CUMPLIDA);
      const pa = est(a, EST_PARCIAL);
      return {
        label: a.area,
        cells: [
          p ? <span className="text-red-400">{fmtNum(p.items)}</span> : "—",
          p ? <span className="text-red-400">{fmtArs(p.importe)}</span> : "—",
          c ? <span className="text-green-400">{fmtNum(c.items)}</span> : "—",
          c ? <span className="text-green-400">{fmtArs(c.importe)}</span> : "—",
          pa ? `${fmtNum(pa.items)} / ${fmtShort(pa.importe)}` : "—",
          fmtNum(a.ocs),
          <strong key="t">{fmtNum(a.items)}</strong>,
          <strong key="i">{fmtArs(a.importe)}</strong>,
        ],
      };
    });
    rows.push({
      label: "TOTAL",
      bold: true,
      rowTone: "total",
      cells: [
        fmtNum(pend?.items ?? 0),
        <span key="p" className="text-red-400">
          {fmtArs(pend?.importe ?? 0)}
        </span>,
        fmtNum(cumpl?.items ?? 0),
        <span key="c" className="text-green-400">
          {fmtArs(cumpl?.importe ?? 0)}
        </span>,
        `${fmtNum(parcial?.items ?? 0)} / ${fmtShort(parcial?.importe ?? 0)}`,
        fmtNum(r.ocs),
        fmtNum(r.items),
        fmtArs(r.importe),
      ],
    });

    const evo = d.meses.map((m) => ({
      mes: fmtMes(m.mes),
      Recibido: m.importeCumplido,
      Pendiente: m.importePendiente,
    }));

    return { d, r, cumpl, pend, parcial, donut, barras, rows, evo };
  }, [d]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <PageTitle
          title="Presupuestos / Órdenes de Compra"
          sub="Por área (tipo de comprobante) y estado — datos en vivo de Magnus, importes pesificados a la cotización de cada OC"
        />
        <div className="flex items-end gap-2 pb-1">
          <label className="text-[11px] uppercase tracking-wider text-zinc-500">
            Desde
            <input
              type="month"
              value={desde}
              max={hasta}
              onChange={(e) => e.target.value && setDesde(e.target.value)}
              className="block mt-1 bg-[#171717] border border-zinc-800 rounded-md px-2.5 py-1.5 text-[12px] text-zinc-200 focus:border-yellow-400/60 outline-none"
            />
          </label>
          <label className="text-[11px] uppercase tracking-wider text-zinc-500">
            Hasta
            <input
              type="month"
              value={hasta}
              min={desde}
              onChange={(e) => e.target.value && setHasta(e.target.value)}
              className="block mt-1 bg-[#171717] border border-zinc-800 rounded-md px-2.5 py-1.5 text-[12px] text-zinc-200 focus:border-yellow-400/60 outline-none"
            />
          </label>
          <button
            onClick={() => cargar(desde, hasta)}
            disabled={cargando}
            className="flex items-center gap-2 bg-[#171717] border border-zinc-800 hover:border-yellow-400/60 rounded-md px-3 py-1.5 text-[12px] text-zinc-300 disabled:opacity-50"
          >
            {cargando ? (
              <Loader2 size={13} className="animate-spin text-yellow-400" />
            ) : (
              <RefreshCw size={13} />
            )}
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <Alert tone="red">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          {error}
        </Alert>
      )}

      {!error && !vista && (
        <div className="flex items-center justify-center gap-3 py-24 text-zinc-600 text-sm">
          {cargando ? (
            <>
              <Loader2 size={16} className="animate-spin text-yellow-400" />
              Consultando órdenes de compra…
            </>
          ) : (
            "Sin órdenes de compra en el período"
          )}
        </div>
      )}

      {vista && (
        <>
          <Grid cols={4}>
            <KPI
              label="Total items OC"
              value={fmtNum(vista.r.items)}
              sub={`${fmtNum(vista.r.ocs)} órdenes · ${fmtMes(vista.d.desde)}${
                vista.d.desde === vista.d.hasta ? "" : ` → ${fmtMes(vista.d.hasta)}`
              }`}
              accent="neutral"
            />
            <KPI
              label="Órdenes cumplidas"
              value={fmtNum(vista.cumpl?.items ?? 0)}
              sub={`${fmtShort(vista.r.importeCumplido)} recibido`}
              accent="green"
            />
            <KPI
              label="Pendientes de recibir"
              value={fmtNum(vista.pend?.items ?? 0)}
              sub={`${fmtShort(vista.r.importePendiente)} pendiente`}
              accent="red"
            />
            <KPI
              label="Importe total OC"
              value={fmtShort(vista.r.importe)}
              sub={
                vista.r.importeUsd > 0
                  ? `incluye ${fmtShort(vista.r.importeUsd)} de OC en U$S`
                  : "valor total comprometido"
              }
              accent="yellow"
            />
          </Grid>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
            <Panel title="Estado de órdenes" accent="(items)">
              <ChartDonut
                data={vista.donut}
                height={280}
                fmt={(n) => fmtNum(n)}
              />
            </Panel>
            <Panel title="Importe por área" accent="($)">
              <ChartBar
                data={vista.barras}
                xKey="area"
                horizontal
                height={280}
                series={[
                  { key: "Cumplida", name: "Cumplida", color: COLOR_ESTADO[2], stackId: "a" },
                  { key: "Pendiente", name: "Pendiente", color: COLOR_ESTADO[1], stackId: "a" },
                  { key: "Parcial", name: "Parcial", color: COLOR_ESTADO[3], stackId: "a" },
                ]}
              />
            </Panel>
          </div>

          <SectionTitle>📋 Resumen de Órdenes de Compra por Área</SectionTitle>

          {vista.pend && vista.pend.items > 0 && (
            <div className="mb-3">
              <Alert tone="amber">
                <AlertTriangle size={14} className="mt-px shrink-0" />
                <span>
                  {fmtNum(vista.pend.items)} items pendientes de recibir por{" "}
                  {fmtArs(vista.pend.importe)}. Mayor concentración en{" "}
                  {[...vista.d.areas]
                    .filter((a) => (est(a, EST_PENDIENTE)?.importe ?? 0) > 0)
                    .sort(
                      (a, b) =>
                        (est(b, EST_PENDIENTE)?.importe ?? 0) -
                        (est(a, EST_PENDIENTE)?.importe ?? 0),
                    )
                    .slice(0, 2)
                    .map(
                      (a) =>
                        `${a.area} (${fmtShort((est(a, EST_PENDIENTE)?.importe ?? 0))})`,
                    )
                    .join(" y ")}
                  .
                </span>
              </Alert>
            </div>
          )}

          <MatrixTable
            firstLabel="Área"
            head={[
              "Pend. items",
              "Importe pend. ($)",
              "Cumplida items",
              "Importe cumpl. ($)",
              "Cumpl. parcial",
              "OC",
              "Items",
              "Importe total ($)",
            ]}
            rows={vista.rows}
          />

          <div className="mt-4">
            {vista.d.areas.slice(0, 8).map((a) => (
              <Progress
                key={a.codigo}
                label={a.area}
                pct={pct(a.importe, vista.d.areas[0]?.importe ?? 0)}
                value={fmtShort(a.importe)}
                tone={
                  (est(a, EST_PENDIENTE)?.importe ?? 0) > a.importe / 2
                    ? "red"
                    : "green"
                }
              />
            ))}
          </div>

          {vista.d.meses.length > 1 && (
            <>
              <SectionTitle>📈 Evolución mensual</SectionTitle>
              <Panel>
                <ChartBar
                  data={vista.evo}
                  xKey="mes"
                  height={260}
                  series={[
                    { key: "Recibido", name: "Recibido", color: COLOR_ESTADO[2], stackId: "a" },
                    { key: "Pendiente", name: "Pendiente", color: COLOR_ESTADO[1], stackId: "a" },
                  ]}
                />
              </Panel>
            </>
          )}

          <SectionTitle>👤 Por comprador</SectionTitle>
          <MatrixTable
            firstLabel="Comprador"
            head={["OC", "Items", "Recibido ($)", "Pendiente ($)", "Importe total ($)"]}
            rows={vista.d.compradores.map((c) => ({
              label: c.comprador,
              cells: [
                fmtNum(c.ocs),
                fmtNum(c.items),
                <span key="r" className="text-green-400">
                  {fmtArs(c.importeCumplido)}
                </span>,
                <span key="p" className="text-red-400">
                  {fmtArs(c.importePendiente)}
                </span>,
                <strong key="t">{fmtArs(c.importe)}</strong>,
              ],
            }))}
          />

          <p className="text-[11px] text-zinc-600 mt-4 leading-relaxed">
            Fuente: Com_OrdCompCabecera / Com_OrdCompRenglones (Magnus, lectura
            en vivo). El área es el tipo de comprobante de la OC. Importe = suma
            de (unidades pedidas × precio del renglón neto de bonificaciones),
            pesificado a la cotización de cada OC.
            {vista.d.canceladas.items > 0 && (
              <>
                {" "}
                Fuera del cuadro: {fmtNum(vista.d.canceladas.items)} items de OC
                canceladas por {fmtArs(vista.d.canceladas.importe)}.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
