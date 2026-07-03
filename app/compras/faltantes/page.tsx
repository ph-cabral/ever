"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, PackageCheck, Truck, CalendarRange, Check,
  Layers, ChevronDown, ChevronRight, Flag, RotateCw, ShoppingCart, Undo2, CalendarCheck,
  Download,
} from "lucide-react";
import { exportarFaltantesCompras } from "@/lib/compras/exportFaltantes";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/faltantes — faltantes "sin existencia" por (artículo, día) con la OC
//   restada, ACUMULADO día a día.
//
//   · Rango "Desde/Hasta": default hoy/hoy. Ampliar "Desde" hacia atrás para ver
//     faltantes de días anteriores. Cada renglón cuenta una sola vez, en su DÍA
//     DE APARICIÓN (no se doble-cuenta el mismo renglón dos veces).
//   · "Faltan" es ACUMULADO por artículo: faltan[día] = faltan[día-1] + lo nuevo
//     de ese día (no se resetea). Se cubre contra la OC "por llegar" (Magnus, en
//     vivo). El día que llega la OC (fechaEntrega): si cubrió con sobrante, el
//     acumulado vuelve a 0 ese día (no se arrastra crédito); si NO alcanzó, el
//     descubierto real sigue tal cual (no se fuerza a 0).
//   · Extraordinario/Comprar (preparado.faltante_extraordinario, por artículo+día):
//     el botón 🚩 de cada fila marca extraordinario=true (comprar queda null,
//     pendiente) → la fila desaparece de esta tabla. La decisión de comprar o
//     no se toma en /ventas/faltantes; recién cuando comprar deja de ser null,
//     el botón "Extraordinario" del header (gira la tarjeta) muestra la fila en
//     el reverso. Ahí queda hasta que la OC "por llegar" cubre el faltante del
//     artículo (descubierto llega a 0) — sale sola, sin acción manual.
//
//   Color de fila por estado del DÍA:
//     · verde  → la OC que llegó a ese día cubre el faltante (descubierto = 0)
//     · rojo   → la OC alcanzó en parte (0 < cubierto < faltan)
//     · neutro → a ese día no le llegó OC (cubierto = 0)
//
//   Fecha de arribo (columna "Arribo"): se carga acá a nivel artículo+día y se
//   aplica (fan-out) a todos los renglones de ese bucket en
//   preparado.faltante_control (/api/compras/faltantes-arribo). Por defecto
//   un bucket con TODOS sus renglones ya con fecha de arribo se oculta de esta
//   vista — botón "Ver con arribo" para corroborar los que ya se pasaron.
//   Reemplaza a /deposito/faltantes/control (ahora redirige acá). "¿Cliente lo
//   quiere?" se sigue decidiendo en /ventas/faltantes, sin cambios.
//   El consumo por día se guarda solo (preparado.faltante_oc_consumo).
// ──────────────────────────────────────────────────────────────────────────────

type Estado = "completo" | "incompleto" | "sin_orden" | "entregado";
type Filtro = "todos" | Estado;

interface Row {
  CodArticulo: string;
  Nombre: string;
  Linea: string | number | null;
  Proveedor: string | null;
  fecha: string; // día del faltante (primera aparición)
  vivo: boolean; // false = histórico ya entregado/cubierto
  faltan: number; // acumulado hasta este día (no se resetea día a día)
  nuevoDelDia: number; // lo nuevo que aportó puntualmente este día
  cubierto: number;
  descubierto: number;
  importe: number;
  renglones: number;
  pedidos: number;
  ocTotal: number;
  fechaEntrega: string | null;
  importacion: boolean;
  ocs: string[];
  estado: Estado;
  extraordinario: boolean;
  comprar: boolean | null; // null = pendiente (decide ventas/faltantes)
  fechaArribo: string | null; // más vieja cargada entre los renglones del bucket
  tieneArribo: boolean; // true = TODOS los renglones del bucket ya la tienen
}

const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtAr = (s: string | null) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};
// Suma días a una fecha YYYY-MM-DD sin corrimiento de huso horario (parseo manual,
// no new Date(str) directo). Usado para sugerir Arribo = Despacho + 2 días.
const addDaysISO = (iso: string, days: number) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// Fecha local (no UTC) en formato YYYY-MM-DD, para que "hoy" coincida con el
// día calendario del usuario y no se corra por huso horario.
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Default de "desde": ancla del cruce con OC (OC_DESDE_DEFAULT del backend).
// Con default hoy–hoy la vista quedaba vacía cada mañana: solo miraba la foto
// de ayer y perdía los buckets/acumulado de los días anteriores.
const DESDE_DEFAULT = "2026-06-26";
// Clave de fila: (artículo, día) — misma granularidad que usa el backend para
// marcar extraordinario/comprar (preparado.faltante_extraordinario).
const rowKey = (r: Pick<Row, "CodArticulo" | "fecha">) => `${r.CodArticulo}__${r.fecha}`;

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "completo", label: "Cubiertos" },
  { key: "incompleto", label: "Parciales" },
  { key: "sin_orden", label: "Sin OC" },
  { key: "entregado", label: "Entregados" },
];

const rowCls: Record<Estado, string> = {
  completo: "bg-green-500/10 hover:bg-green-500/[0.16]",
  entregado: "bg-emerald-500/10 hover:bg-emerald-500/[0.16]",
  incompleto: "bg-red-500/10 hover:bg-red-500/[0.16]",
  sin_orden: "hover:bg-zinc-900/50",
};
const cubiertoCls: Record<Estado, string> = {
  completo: "text-green-400",
  entregado: "text-emerald-400",
  incompleto: "text-amber-400",
  sin_orden: "text-zinc-600",
};

// Tabla reutilizable: una sola tabla o el cuerpo de cada acordeón por proveedor.
function Tabla({
  data,
  onMark,
  onArribo,
}: {
  data: Row[];
  onMark: (row: Row) => void;
  onArribo: (row: Row, fechaArribo: string | null) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-[#1A1A1A] text-zinc-400">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium"></th>
            <th className="px-3 py-2 font-medium">Cód.</th>
            <th className="px-3 py-2 font-medium">Artículo</th>
            <th className="px-3 py-2 font-medium">Día</th>
            <th className="px-3 py-2 font-medium text-right">Faltan</th>
            <th className="px-3 py-2 font-medium text-right">Cubre OC</th>
            <th className="px-3 py-2 font-medium text-right">Falta OC</th>
            <th className="px-3 py-2 font-medium">Despacho</th>
            <th className="px-3 py-2 font-medium">Proveedor</th>
            <th className="px-3 py-2 font-medium text-right">Importe</th>
            <th className="px-3 py-2 font-medium">Arribo</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const prev = data[i - 1];
            const nuevoArt = !prev || prev.CodArticulo !== r.CodArticulo;
            return (
              <tr
                key={rowKey(r)}
                className={`transition-colors ${rowCls[r.estado]} ${
                  nuevoArt ? "border-t-2 border-zinc-700/80" : "border-t border-zinc-800/50"
                }`}
              >
                <td className="px-2 py-2">
                  <button
                    onClick={() => onMark(r)}
                    title="Marcar como pedido extraordinario (pasa al reverso)"
                    className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                  >
                    <Flag size={14} />
                  </button>
                </td>
                <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">
                  {nuevoArt ? r.CodArticulo : ""}
                </td>
                <td className="px-3 py-2 text-zinc-100">
                  {nuevoArt ? (
                    <span>
                      {r.Nombre}
                      {r.ocTotal > 0 && (
                        <span className="ml-2 text-[11px] text-zinc-500">
                          OC total {fmtNum(r.ocTotal)}
                        </span>
                      )}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-400 whitespace-nowrap tabular-nums">
                  {fmtAr(r.fecha)}
                  {r.pedidos > 1 && (
                    <span className="ml-2 text-[11px] text-zinc-600">{r.pedidos} ped.</span>
                  )}
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums text-zinc-100"
                  title={
                    r.vivo && r.nuevoDelDia !== r.faltan
                      ? `Acumulado. Nuevo este día: ${fmtNum(r.nuevoDelDia)}`
                      : undefined
                  }
                >
                  {fmtNum(r.faltan)}
                  {r.vivo && r.nuevoDelDia > 0 && r.nuevoDelDia !== r.faltan && (
                    <span className="ml-1 text-[11px] text-zinc-600">
                      (+{fmtNum(r.nuevoDelDia)})
                    </span>
                  )}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums font-medium ${cubiertoCls[r.estado]}`}
                >
                  {r.cubierto > 0 ? (
                    <span className="inline-flex items-center gap-1 justify-end">
                      {r.estado === "entregado" ? (
                        <Check size={13} className="opacity-80" />
                      ) : (
                        <Truck size={13} className="opacity-70" />
                      )}
                      {fmtNum(r.cubierto)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-red-300/90">
                  {r.descubierto > 0 ? fmtNum(r.descubierto) : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                  {r.estado === "entregado"
                    ? <span className="text-emerald-400/80">Entregado</span>
                    : r.cubierto > 0
                      ? r.importacion
                        ? <span className="text-amber-400/80">Importación</span>
                        : fmtAr(r.fechaEntrega)
                      : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-400">{nuevoArt ? r.Proveedor || "—" : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                  ${fmtNum(r.importe)}
                </td>
                <td className="px-3 py-2">
                  {(() => {
                    // Sugerido = Despacho + 2 días, solo mientras no haya arribo
                    // cargado a mano. No se persiste hasta que se edite/confirme.
                    const sugerido = !r.fechaArribo && r.fechaEntrega ? addDaysISO(r.fechaEntrega, 2) : null;
                    return (
                      <input
                        type="date"
                        value={r.fechaArribo ?? sugerido ?? ""}
                        onChange={(e) => onArribo(r, e.target.value || null)}
                        title={
                          r.tieneArribo
                            ? "Ya cargada — se oculta salvo 'Ver con arribo'"
                            : sugerido
                              ? "Sugerido: Despacho + 2 días. No guardado — editá para confirmar o corregir por retraso."
                              : "Cargar fecha de arribo (aplica a todos los renglones del artículo ese día)"
                        }
                        className={`bg-[#1f1f1f] border rounded-md px-2 py-1 text-xs outline-none [color-scheme:dark] ${
                          r.tieneArribo
                            ? "border-emerald-600 text-emerald-300"
                            : sugerido
                              ? "border-dashed border-zinc-600 text-zinc-400 focus:border-yellow-400"
                              : "border-zinc-700 text-zinc-200 focus:border-yellow-400"
                        }`}
                      />
                    );
                  })()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Reverso de la tarjeta: pedidos extraordinario=true, YA decididos (comprar
// !== null, decisión que toma ventas/faltantes) y con descubierto > 0 (la OC
// por llegar todavía no cubre el faltante; ver backRows en el componente de
// abajo). El toggle "Comprar" de acá permite a compras cambiar manualmente
// esa decisión (true↔false), pero no volver a dejarla pendiente (null).
//   · Desmarcar "Extraordinario" → vuelve a la tabla principal.
function TablaExtraordinarios({
  data,
  onToggle,
}: {
  data: Row[];
  onToggle: (row: Row, patch: Partial<Pick<Row, "extraordinario" | "comprar">>) => void;
}) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28 gap-3 text-center rounded-xl border border-zinc-800">
        <ShoppingCart size={40} className="text-zinc-700" />
        <p className="text-zinc-400 font-medium">
          No hay pedidos extraordinarios marcados para comprar.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-red-900/50">
      <table className="w-full text-sm">
        <thead className="bg-[#1A1A1A] text-zinc-400">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Cód.</th>
            <th className="px-3 py-2 font-medium">Artículo</th>
            <th className="px-3 py-2 font-medium">Día</th>
            <th className="px-3 py-2 font-medium text-right">Faltan</th>
            <th className="px-3 py-2 font-medium text-right">Falta OC</th>
            <th className="px-3 py-2 font-medium">Proveedor</th>
            <th className="px-3 py-2 font-medium text-right">Importe</th>
            <th className="px-3 py-2 font-medium text-center">Extraordinario</th>
            <th className="px-3 py-2 font-medium text-center">Comprar</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr
              key={rowKey(r)}
              className="border-t border-zinc-800/50 bg-red-500/[0.06] hover:bg-red-500/[0.1] transition-colors"
            >
              <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">{r.CodArticulo}</td>
              <td className="px-3 py-2 text-zinc-100">{r.Nombre}</td>
              <td className="px-3 py-2 text-zinc-400 whitespace-nowrap tabular-nums">{fmtAr(r.fecha)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-100">{fmtNum(r.faltan)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-red-300/90">
                {r.descubierto > 0 ? fmtNum(r.descubierto) : "—"}
              </td>
              <td className="px-3 py-2 text-zinc-400">{r.Proveedor || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-300">${fmtNum(r.importe)}</td>
              <td className="px-3 py-2 text-center">
                <button
                  onClick={() => onToggle(r, { extraordinario: false })}
                  title="Desmarcar extraordinario (vuelve a la tabla principal)"
                  className="inline-flex items-center gap-1 text-red-400 hover:text-zinc-400 transition-colors px-2 py-1 rounded border border-red-400/40"
                >
                  <Undo2 size={13} />
                </button>
              </td>
              <td className="px-3 py-2 text-center">
                <button
                  onClick={() => onToggle(r, { comprar: !r.comprar })}
                  title={r.comprar ? "Desmarcar comprar" : "Marcar comprar"}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded border transition-colors ${
                    r.comprar
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                      : "border-zinc-600 text-transparent hover:border-zinc-400"
                  }`}
                >
                  <Check size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ComprasFaltantesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [desdeResp, setDesdeResp] = useState<string | null>(null);
  const [hastaResp, setHastaResp] = useState<string | null>(null);
  const [desde, setDesde] = useState(DESDE_DEFAULT); // rango de búsqueda, default = ancla OC
  const [hasta, setHasta] = useState(todayISO);
  const [conArribo, setConArribo] = useState(false); // ver también los que ya tienen fecha de arribo
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocWarn, setOcWarn] = useState(false);
  const [ocDesde, setOcDesde] = useState<string | null>(null);
  const [agrupar, setAgrupar] = useState(false); // agrupar por proveedor
  const [cerrados, setCerrados] = useState<Record<string, boolean>>({}); // acordeones colapsados
  const [flipped, setFlipped] = useState(false); // girar la tarjeta → ver extraordinarios

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOcWarn(false);
    try {
      const p = new URLSearchParams();
      p.set("desde", desde);
      p.set("hasta", hasta);
      if (conArribo) p.set("conArribo", "1");
      const res = await fetch(`/api/compras/faltantes-consumo?${p}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.rows ?? []);
      setFecha(j.fecha ?? null);
      setDesdeResp(j.desde ?? null);
      setHastaResp(j.hasta ?? null);
      setOcDesde(j.ocDesde ?? null);
      setOcWarn(!!j.ocWarn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, conArribo]);

  useEffect(() => {
    load();
  }, [load]);

  // Marcar/desmarcar extraordinario y/o comprar. Optimista: actualiza la UI ya,
  // y si el POST falla revierte + avisa. Clave: (CodArticulo, fecha).
  const toggleMark = useCallback(
    async (row: Row, patch: Partial<Pick<Row, "extraordinario" | "comprar">>) => {
      const prev = { extraordinario: row.extraordinario, comprar: row.comprar };
      const next = { ...prev, ...patch };
      setRows((rs) => rs.map((r) => (rowKey(r) === rowKey(row) ? { ...r, ...next } : r)));
      try {
        const res = await fetch("/api/compras/faltantes-extraordinario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fecha: row.fecha, codArticulo: row.CodArticulo, ...next }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setRows((rs) => rs.map((r) => (rowKey(r) === rowKey(row) ? { ...r, ...prev } : r)));
        setError("No se pudo guardar la marca de extraordinario/comprar");
      }
    },
    [],
  );
  // Botón por fila: marca extraordinario y deja "comprar" pendiente (null).
  // La decisión de comprar o no la toma ventas/faltantes; recién ahí, cuando
  // deja de ser null, la fila aparece en el reverso.
  const marcarExtraordinario = useCallback(
    (row: Row) => toggleMark(row, { extraordinario: true, comprar: null }),
    [toggleMark],
  );

  // Carga/borra la fecha de arribo del bucket (artículo+día). El fan-out por
  // renglón a preparado.faltante_control lo hace el backend (ver
  // /api/compras/faltantes-arribo) — acá solo se actualiza optimista y se
  // revierte si falla. Reemplaza a /deposito/faltantes/control.
  const guardarArribo = useCallback(async (row: Row, fechaArribo: string | null) => {
    const prev = { fechaArribo: row.fechaArribo, tieneArribo: row.tieneArribo };
    setRows((rs) =>
      rs.map((r) =>
        rowKey(r) === rowKey(row) ? { ...r, fechaArribo, tieneArribo: !!fechaArribo } : r,
      ),
    );
    try {
      const res = await fetch("/api/compras/faltantes-arribo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: row.fecha, codArticulo: row.CodArticulo, fechaArribo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows((rs) => rs.map((r) => (rowKey(r) === rowKey(row) ? { ...r, ...prev } : r)));
      setError("No se pudo guardar la fecha de arribo");
    }
  }, []);

  // Tabla principal: nunca muestra lo marcado extraordinario.
  const frontRows = useMemo(() => rows.filter((r) => !r.extraordinario), [rows]);
  // Reverso de la tarjeta: extraordinario, ya decidido (comprar !== null) Y
  // todavía con descubierto > 0 (la OC "por llegar" aún no cubre el faltante
  // del artículo). Apenas la OC lo cubre (descubierto llega a 0 o queda a
  // favor), sale sola de acá — no hace falta desmarcar nada a mano.
  const backRows = useMemo(
    () => rows.filter((r) => r.extraordinario && r.comprar !== null && r.descubierto > 0),
    [rows],
  );

  const conteo = useMemo(() => {
    const c = { todos: frontRows.length, completo: 0, incompleto: 0, sin_orden: 0, entregado: 0 };
    for (const r of frontRows) c[r.estado]++;
    return c as Record<Filtro, number>;
  }, [frontRows]);

  // Orden por valor (importe desc), siempre.
  const visibles = useMemo(() => {
    const base = filtro === "todos" ? frontRows : frontRows.filter((r) => r.estado === filtro);
    return [...base].sort((a, b) => b.importe - a.importe);
  }, [frontRows, filtro]);

  const exportar = useCallback(() => {
    exportarFaltantesCompras(flipped ? backRows : visibles, {
      modo: flipped ? "extraordinarios" : "faltantes",
      desde: desdeResp,
      hasta: hastaResp,
    });
  }, [flipped, backRows, visibles, desdeResp, hastaResp]);

  // Grupos por proveedor, cada grupo ordenado por importe y los grupos por importe total.
  const grupos = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of visibles) {
      const k = r.Proveedor || "Sin proveedor";
      const arr = m.get(k);
      if (arr) arr.push(r);
      else m.set(k, [r]);
    }
    return [...m.entries()]
      .map(([prov, rs]) => ({ prov, rs, importe: rs.reduce((s, x) => s + x.importe, 0) }))
      .sort((a, b) => b.importe - a.importe);
  }, [visibles]);

  // faltan/cubierto/descubierto de las filas "vivo" son ACUMULADOS por artículo
  // (crecen día a día, no se resetean). Sumar todas las filas duplicaría el
  // acumulado: para el total se toma solo la fila más nueva (última fecha) de
  // cada artículo. Las filas "entregado" (histórico) no acumulan, se suman todas.
  const tot = useMemo(() => {
    let importe = 0;
    const arts = new Set<string>();
    const ultimaVivaPorArt = new Map<string, Row>();
    let faltan = 0, cubierto = 0, descubierto = 0;
    for (const r of visibles) {
      importe += r.importe;
      arts.add(r.CodArticulo);
      if (r.vivo) {
        const prev = ultimaVivaPorArt.get(r.CodArticulo);
        if (!prev || r.fecha > prev.fecha) ultimaVivaPorArt.set(r.CodArticulo, r);
      } else {
        faltan += r.faltan;
        cubierto += r.cubierto;
        descubierto += r.descubierto;
      }
    }
    for (const r of ultimaVivaPorArt.values()) {
      faltan += r.faltan;
      cubierto += r.cubierto;
      descubierto += r.descubierto;
    }
    return { art: arts.size, dias: visibles.length, faltan, cubierto, descubierto, importe };
  }, [visibles]);

  const rango =
    desdeResp && hastaResp && desdeResp !== hastaResp
      ? `${fmtAr(desdeResp)} – ${fmtAr(hastaResp)}`
      : fmtAr(fecha);

  const hay = frontRows.length > 0;

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

      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex items-center justify-between px-4 md:px-8 h-16 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-bold text-yellow-400 text-xl md:text-2xl tracking-wide uppercase whitespace-nowrap">
            EVER WEAR <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="hidden md:block w-px h-7 bg-yellow-400/30" />
          <span className="hidden md:inline text-zinc-500 text-sm">
            Faltantes a encargar · {rango}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline text-zinc-400">
            <b className="text-yellow-400">{tot.art}</b> art. ·{" "}
            <b className="text-zinc-200">faltan {fmtNum(tot.faltan)}</b> ·{" "}
            <b className="text-green-400">cubren {fmtNum(tot.cubierto)}</b> ·{" "}
            <b className="text-red-400">faltan OC {fmtNum(tot.descubierto)}</b>
          </span>
          <button
            onClick={load}
            title="Refrescar"
            disabled={loading}
            className="text-zinc-400 hover:text-yellow-400 transition-colors p-2 disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-3 md:px-8 py-6">
        {/* Selector de rango + filtros por estado */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 mr-2">
            <CalendarRange size={15} className="text-zinc-500" />
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-[#1A1A1A] border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:border-yellow-400 outline-none"
            />
            <span className="text-zinc-600 text-xs">a</span>
            <input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => setHasta(e.target.value)}
              className="bg-[#1A1A1A] border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:border-yellow-400 outline-none"
            />
            {(desde !== DESDE_DEFAULT || hasta !== todayISO()) && (
              <button
                onClick={() => {
                  setDesde(DESDE_DEFAULT);
                  setHasta(todayISO());
                }}
                className="text-xs text-zinc-500 hover:text-yellow-400 underline underline-offset-2"
              >
                restablecer
              </button>
            )}
          </div>

          <button
            onClick={() => setConArribo((v) => !v)}
            title="Mostrar también los artículos que ya tienen fecha de arribo cargada (para corroborar los que se pasaron)"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
              conArribo
                ? "bg-emerald-500/15 border-emerald-400 text-emerald-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            <CalendarCheck size={14} />
            Ver con arribo
            {conArribo && <Check size={13} />}
          </button>

          <button
            onClick={() => setAgrupar((v) => !v)}
            title="Agrupar los faltantes por proveedor en tablas con acordeón"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
              agrupar
                ? "bg-sky-500/15 border-sky-400 text-sky-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            <Layers size={14} />
            Agrupar por proveedor
            {agrupar && <Check size={13} />}
          </button>

          <button
            onClick={() => setFlipped((v) => !v)}
            title="Ver pedidos extraordinarios marcados para comprar (gira la tabla)"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
              backRows.length > 0
                ? "bg-red-500/15 border-red-400 text-red-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            <RotateCw
              size={14}
              className={`transition-transform duration-500 ${flipped ? "rotate-180" : ""}`}
            />
            Extraordinario
            {backRows.length > 0 && (
              <span className="bg-red-500 text-white rounded-full px-1.5 text-[10px] leading-4 tabular-nums">
                {backRows.length}
              </span>
            )}
          </button>

          <button
            onClick={exportar}
            disabled={flipped ? backRows.length === 0 : visibles.length === 0}
            title="Exportar a Excel lo que se ve en la tabla"
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-yellow-400 hover:text-yellow-400 transition-colors text-xs font-medium disabled:opacity-40"
          >
            <Download size={14} /> Excel
          </button>

          {ocDesde && (
            <span
              title="El cruce con OC arranca en esta fecha: solo se cuentan las órdenes de compra y los faltantes desde acá."
              className="text-[11px] text-zinc-500 whitespace-nowrap"
            >
              OC desde {fmtAr(ocDesde)}
            </span>
          )}

          <div className="w-px h-5 bg-zinc-800 hidden sm:block" />

          {/* "entregado" ya no existe: todo lo marcado sin existencia es demanda viva */}
          {FILTROS.filter((f) => f.key !== "entregado").map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                filtro === f.key
                  ? "bg-yellow-400/15 border-yellow-400 text-yellow-300"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {f.label}
              <span
                className={`tabular-nums ${
                  filtro === f.key ? "text-yellow-200/80" : "text-zinc-500"
                }`}
              >
                {conteo[f.key] ?? 0}
              </span>
            </button>
          ))}
          {ocWarn && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400/80 ml-1">
              <AlertTriangle size={13} /> OC no disponible — todo figura sin orden
            </span>
          )}
        </div>

        {/* Tarjeta que gira: frente = tabla normal, reverso = extraordinarios */}
        <div className="[perspective:2000px]">
          <div
            className={`relative grid transition-transform duration-700 ease-in-out [transform-style:preserve-3d] ${
              flipped ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            {/* Frente */}
            <div
              className={`col-start-1 row-start-1 [backface-visibility:hidden] ${
                flipped ? "pointer-events-none" : ""
              }`}
            >
              {!hay ? (
                <div className="flex flex-col items-center justify-center py-28 gap-3 text-center">
                  {loading ? (
                    <Loader2 size={40} className="text-yellow-400 animate-spin" />
                  ) : (
                    <PackageCheck size={44} className="text-zinc-700" />
                  )}
                  <p className="text-zinc-400 font-medium">
                    {loading
                      ? "Consultando la base…"
                      : "No hay faltantes marcados como “sin existencia”."}
                  </p>
                </div>
              ) : agrupar ? (
                <div className="flex flex-col gap-3">
                  {grupos.map(({ prov, rs, importe }) => {
                    const abierto = !cerrados[prov];
                    return (
                      <div key={prov} className="rounded-xl border border-zinc-800 overflow-hidden">
                        <button
                          onClick={() => setCerrados((c) => ({ ...c, [prov]: abierto }))}
                          className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-[#1A1A1A] hover:bg-[#202020] transition-colors text-left"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {abierto ? (
                              <ChevronDown size={15} className="text-zinc-500 shrink-0" />
                            ) : (
                              <ChevronRight size={15} className="text-zinc-500 shrink-0" />
                            )}
                            <span className="font-medium text-zinc-100 truncate">{prov}</span>
                            <span className="text-[11px] text-zinc-500 shrink-0">{rs.length} reng.</span>
                          </span>
                          <span className="text-sm tabular-nums text-zinc-300 shrink-0">
                            ${fmtNum(importe)}
                          </span>
                        </button>
                        {abierto && (
                          <div className="border-t border-zinc-800">
                            <Tabla data={rs} onMark={marcarExtraordinario} onArribo={guardarArribo} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Tabla data={visibles} onMark={marcarExtraordinario} onArribo={guardarArribo} />
              )}
            </div>

            {/* Reverso */}
            <div
              className={`col-start-1 row-start-1 [backface-visibility:hidden] [transform:rotateY(180deg)] ${
                !flipped ? "pointer-events-none" : ""
              }`}
            >
              <TablaExtraordinarios data={backRows} onToggle={toggleMark} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
