"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type Campos = Record<string, string | null>;
export type Tarjeta = {
  id: number;
  columnaId: number;
  tableroId: number;
  orden: number;
  campos: Campos;
};
export type Columna = { id: number; tableroId: number; nombre: string; orden: number; tarjetas: Tarjeta[] };
export type ColGlobal = { id: number; nombre: string; orden: number };
export type Tablero = {
  id: number;
  clave: string;
  nombre: string;
  columnas: Columna[];
  columnasGlobales: ColGlobal[];
  ocultas: number[];
};
export type CampoDef = {
  k: string;
  l: string;
  t: "text" | "textarea" | "date" | "select";
  opciones?: string[];
  auto?: boolean;
  /** Si es true, el select muestra un botón "+" para agregar opciones nuevas (persistidas). */
  extensible?: boolean;
};

export const DEFAULT_SCHEMA: { titleKey: string; fields: CampoDef[] } = {
  titleKey: "descripcion",
  fields: [
    { k: "fecha", l: "Fecha", t: "date", auto: true },
    { k: "descripcion", l: "Descripción", t: "textarea" },
    { k: "ubicacion", l: "Ubicación", t: "text" },
  ],
};

export const SCHEMAS: Record<string, { titleKey: string; fields: CampoDef[] }> = {
  sistema: {
    titleKey: "descripcion",
    fields: [
      { k: "fecha", l: "Fecha", t: "date", auto: true },
      { k: "descripcion", l: "Problema / solución", t: "textarea" },
      { k: "ubicacion", l: "Ubicación", t: "select", opciones: [], extensible: true },
      {
        k: "categoria",
        l: "Categoría",
        t: "select",
        opciones: ["Impresoras", "Automatización", "Mantenimiento de equipos", "Varios"],
        extensible: true,
      },
      { k: "importancia", l: "Importancia", t: "select", opciones: ["Alta", "Media", "Baja"] },
    ],
  },
  softech: {
    titleKey: "problema",
    fields: [
      { k: "inicio", l: "Inicio", t: "date" },
      { k: "problema", l: "Problema", t: "text" },
      { k: "sistema", l: "Sistema", t: "text" },
      { k: "fin", l: "Fin", t: "date" },
      { k: "origen", l: "Origen del error", t: "text" },
      { k: "accion", l: "Acción / nota", t: "textarea" },
    ],
  },
  buren: {
    titleKey: "problema",
    fields: [
      { k: "fecha", l: "Fecha", t: "date" },
      { k: "ubicacion", l: "Ubicación", t: "text" },
      { k: "problema", l: "Problema", t: "text" },
      { k: "tiempo", l: "Tiempo (hh:mm)", t: "text" },
    ],
  },
};
export const schemaFor = (clave: string) => SCHEMAS[clave] ?? DEFAULT_SCHEMA;

const PALETTE = ["#5b8def", "#7c5bef", "#3ecf8e", "#e0b341", "#e0556b", "#3ec7cf", "#cf8de0"];

export function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
const FECHA_FIELD: Record<string, string> = { softech: "inicio" };
function fechaFieldFor(clave?: string) {
  return FECHA_FIELD[clave ?? ""] ?? "fecha";
}
function mesKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function mesAnteriorKey(d: Date) {
  return mesKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}
function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
// Columnas del tablero "sistema" con orden manual (drag habilitado). El resto
// de las columnas de ese tablero se autoordenan por fecha (más reciente arriba).
const COLUMNAS_ORDEN_MANUAL = ["para aprobacion", "pendiente", "en progreso"];
function esOrdenManual(nombre: string) {
  return COLUMNAS_ORDEN_MANUAL.includes(normalizar(nombre));
}
// Columnas "cerradas" del tablero "sistema": solo muestran tarjetas del mes en curso.
function esColumnaCerradaSistema(nombre: string) {
  const n = normalizar(nombre);
  return n.includes("resuelto") || n.includes("arreglado") || n.includes("sin solucionar");
}
function mesLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}
function mesLabelCorto(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
}
function timeToMinutes(s?: string | null): number {
  if (!s) return 0;
  const m = String(s).match(/^(\d+):(\d{1,2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}
function countBy<T>(arr: T[], keyFn: (x: T) => string | undefined | null) {
  const map = new Map<string, number>();
  for (const item of arr) {
    const k = keyFn(item) || "(sin dato)";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

export async function apiJson(url: string, opts?: RequestInit) {
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export default function SistemaClient() {
  const [tableros, setTableros] = useState<Tablero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<string>("sistema");
  const [msg, setMsg] = useState("");
  const [configCols, setConfigCols] = useState(false);
  const [unificarAbierto, setUnificarAbierto] = useState(false);

  const [modalTarjeta, setModalTarjeta] = useState<{
    tarjeta: Tarjeta | null; // null = creando
    columnaId: number;
    clave: string;
    tableroId: number;
  } | null>(null);

  const dragCard = useRef<{ id: number; fromColId: number } | null>(null);
  const dragCol = useRef<{ id: number } | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<number | null>(null);
  // posición donde se soltaría ahora mismo (solo visual, no toca `tableros` hasta soltar)
  const [hoverSlot, setHoverSlot] = useState<{ colId: number; index: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pointerX = useRef<number | null>(null);

  // auto-scroll horizontal del tablero al arrastrar una tarjeta cerca del borde
  useEffect(() => {
    if (draggingCardId == null) return;
    const EDGE = 90;
    const MAX_SPEED = 22;
    let raf: number;
    const tick = () => {
      const el = boardRef.current;
      const x = pointerX.current;
      if (el && x != null) {
        const rect = el.getBoundingClientRect();
        if (x < rect.left + EDGE) {
          el.scrollLeft -= MAX_SPEED * ((rect.left + EDGE - x) / EDGE);
        } else if (x > rect.right - EDGE) {
          el.scrollLeft += MAX_SPEED * ((x - (rect.right - EDGE)) / EDGE);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draggingCardId]);

  const cargar = async () => {
    try {
      const data = await apiJson("/api/sistema");
      setTableros(data);
    } catch {
      setMsg("No se pudo cargar /api/sistema.");
    }
    setCargando(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const tablero = useMemo(() => tableros.find((t) => t.clave === tab), [tableros, tab]);

  // ---------- tableros ----------
  const crearTablero = async () => {
    const nombre = window.prompt("Nombre del nuevo tablero (empresa/área):");
    if (!nombre || !nombre.trim()) return;
    const sugerida = nombre.trim().toLowerCase().replace(/\s+/g, "_");
    const clave = window.prompt("Clave corta y única (sin espacios):", sugerida);
    if (!clave || !clave.trim()) return;
    const r = await fetch("/api/sistema/tableros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: clave.trim(), nombre: nombre.trim() }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || "No se pudo crear el tablero.");
      return;
    }
    const t = await r.json();
    await cargar();
    setTab(t.clave);
  };

  // ---------- columnas (globales) ----------
  const crearColumna = async () => {
    const nombre = window.prompt("Nombre de la nueva columna (vale para todos los tableros):");
    if (!nombre || !nombre.trim()) return;
    await apiJson("/api/sistema/columnas", {
      method: "POST",
      body: JSON.stringify({ nombre: nombre.trim() }),
    });
    cargar();
  };

  const renombrarColumna = async (col: Columna) => {
    const nombre = window.prompt("Nuevo nombre de columna:", col.nombre);
    if (!nombre || !nombre.trim() || nombre.trim() === col.nombre) return;
    await apiJson(`/api/sistema/columnas/${col.id}`, {
      method: "PATCH",
      body: JSON.stringify({ nombre: nombre.trim() }),
    });
    cargar();
  };

  const borrarColumna = async (col: Columna) => {
    if (!window.confirm(`¿Borrar columna "${col.nombre}" de TODOS los tableros? Las tarjetas se mueven a otra columna.`))
      return;
    const r = await fetch(`/api/sistema/columnas/${col.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || "No se pudo borrar la columna.");
    }
    cargar();
  };

  const toggleColumna = async (tableroId: number, columnaId: number, oculta: boolean) => {
    await apiJson(`/api/sistema/tableros/${tableroId}/columnas`, {
      method: "PATCH",
      body: JSON.stringify({ columnaId, oculta }),
    });
    cargar();
  };

  const moverColumna = (tableroId: number, colId: number, dir: -1 | 1) => {
    const t = tableros.find((x) => x.id === tableroId);
    if (!t) return;
    // columnas son globales: reordenar sobre la lista global completa
    const cols = [...t.columnasGlobales].sort((a, b) => a.orden - b.orden);
    const idx = cols.findIndex((c) => c.id === colId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= cols.length) return;
    [cols[idx], cols[j]] = [cols[j], cols[idx]];
    apiJson("/api/sistema/columnas/reorder", {
      method: "PATCH",
      body: JSON.stringify({ orden: cols.map((c) => c.id) }),
    })
      .then(() => cargar())
      .catch(() => cargar());
  };

  // ---------- tarjetas ----------
  // Mientras se arrastra NO se toca `tableros` (evita repintar/mover el nodo que
  // el navegador está arrastrando, cosa que corta el drag nativo a mitad de
  // camino). Solo se guarda dónde caería (`hoverSlot`) y eso pinta un hueco.
  // El reacomodo real de datos se hace una sola vez al soltar, en finalizarDrop.
  const finalizarDrop = () => {
    const dc = dragCard.current;
    const slot = hoverSlot;
    dragCard.current = null;
    setDraggingCardId(null);
    setHoverSlot(null);
    if (!dc) return;

    const destColId = slot?.colId ?? dc.fromColId;
    const destIndexRaw = slot?.index ?? 0;

    const tcopy: Tablero[] = tableros.map((t) => ({
      ...t,
      columnas: t.columnas.map((c) => ({ ...c, tarjetas: [...c.tarjetas] })),
    }));

    let card: Tarjeta | undefined;
    let srcCol: Columna | undefined;
    for (const t of tcopy)
      for (const c of t.columnas) {
        const idx = c.tarjetas.findIndex((tj) => tj.id === dc.id);
        if (idx >= 0) {
          card = c.tarjetas[idx];
          srcCol = c;
          c.tarjetas.splice(idx, 1);
        }
      }
    if (!card || !srcCol) return;

    let destCol: Columna | undefined;
    for (const t of tcopy) for (const c of t.columnas) if (c.id === destColId) destCol = c;
    if (!destCol) return;

    const idx = Math.max(0, Math.min(destIndexRaw, destCol.tarjetas.length));
    destCol.tarjetas.splice(idx, 0, {
      ...card,
      columnaId: destCol.id,
      campos:
        destCol.id !== srcCol.id
          ? { ...card.campos, fecha: new Date().toISOString() }
          : card.campos,
    });

    const cambios: { id: number; columnaId: number; orden: number }[] = [];
    srcCol.tarjetas.forEach((tj, i) => cambios.push({ id: tj.id, columnaId: srcCol!.id, orden: i }));
    if (destCol.id !== srcCol.id) {
      destCol.tarjetas.forEach((tj, i) => cambios.push({ id: tj.id, columnaId: destCol!.id, orden: i }));
    }

    setTableros(tcopy);
    if (cambios.length) {
      apiJson("/api/sistema/tarjetas/reorder", {
        method: "PATCH",
        body: JSON.stringify({ cambios }),
      })
        .then(() => cargar())
        .catch(() => cargar());
    }
  };

  const borrarTarjeta = async (id: number) => {
    if (!window.confirm("¿Borrar esta tarjeta?")) return;
    await fetch(`/api/sistema/tarjetas/${id}`, { method: "DELETE" });
    setModalTarjeta(null);
    cargar();
  };

  const guardarTarjeta = async (campos: Campos) => {
    if (!modalTarjeta) return;
    if (modalTarjeta.tarjeta) {
      await apiJson(`/api/sistema/tarjetas/${modalTarjeta.tarjeta.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          campos: { ...campos, fecha: new Date().toISOString() },
        }),
      });
    } else {
      await apiJson("/api/sistema/tarjetas", {
        method: "POST",
        body: JSON.stringify({
          columnaId: modalTarjeta.columnaId,
          tableroId: modalTarjeta.tableroId,
          campos: { ...campos, fecha: new Date().toISOString() },
        }),
      });
    }
    setModalTarjeta(null);
    cargar();
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-zinc-400 flex items-center justify-center">
        Cargando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="sticky top-0 z-20 bg-[#151515] border-b border-zinc-800 px-6 h-14 flex items-center gap-4">
        <Link href="/" className="text-zinc-400 hover:text-white text-sm">
          ← Inicio
        </Link>
        <h1 className="font-bold text-rose-500 text-lg">Sistema</h1>
        <Link
          href="/sistema/edit"
          className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 rounded-md px-2 py-1 ml-auto"
        >
          📋 Vista tabla / editar fechas
        </Link>
        {msg && <span className="text-amber-400 text-sm ml-4">{msg}</span>}
      </header>

      <nav className="bg-[#1a1a1a] border-b border-zinc-800 px-6 flex gap-1 items-center overflow-x-auto scrollbar-hide">
        {tableros.map((t) => (
          <button
            key={t.clave}
            onClick={() => setTab(t.clave)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.clave
                ? "text-rose-400 border-rose-500"
                : "text-zinc-500 border-transparent hover:text-zinc-200"
            }`}
          >
            {t.nombre}
          </button>
        ))}
        <button
          onClick={crearTablero}
          className="px-3 py-3 text-sm font-medium text-zinc-500 hover:text-zinc-200 whitespace-nowrap"
          title="Agregar tablero"
        >
          ＋ Tablero
        </button>
        <button
          onClick={() => setTab("metricas")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            tab === "metricas"
              ? "text-rose-400 border-rose-500"
              : "text-zinc-500 border-transparent hover:text-zinc-200"
          }`}
        >
          📊 Métricas
        </button>
      </nav>

      <main className="px-6 py-6">
        {tab === "metricas" ? (
          <Metricas tableros={tableros} />
        ) : tablero ? (
          <>
            <div className="mb-3 flex items-center gap-3">
              <button
                onClick={() => setConfigCols((v) => !v)}
                className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 rounded-md px-2 py-1"
              >
                ⚙ Columnas visibles
              </button>
              {schemaFor(tablero.clave).fields.some((f) => f.t === "select" && f.extensible) && (
                <button
                  onClick={() => setUnificarAbierto(true)}
                  className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 rounded-md px-2 py-1"
                  title="Unificar valores duplicados (ubicación, categoría)"
                >
                  🧹 Unificar valores
                </button>
              )}
              {configCols && (
                <div className="flex flex-wrap gap-2">
                  {tablero.columnasGlobales.map((c) => {
                    const oculta = tablero.ocultas.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-1.5 text-xs text-zinc-300 bg-[#161616] border border-zinc-800 rounded-md px-2 py-1 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={!oculta}
                          onChange={() => toggleColumna(tablero.id, c.id, !oculta)}
                        />
                        {c.nombre}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              ref={boardRef}
              className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide"
              onDragOver={(e) => {
                pointerX.current = e.clientX;
              }}
            >
              {tablero.columnas.map((col) => {
                const sch = schemaFor(tablero.clave);
                const titleKey = sch.titleKey;
                const subtitleField = sch.fields.find((f) => f.t === "date");
                const esSistema = tablero.clave === "sistema";
                // Sistema: orden manual solo en "para aprobación" / "pendiente" / "en
                // progreso"; el resto se autoordena por fecha (más reciente arriba).
                const ordenManual = esSistema && esOrdenManual(col.nombre);
                const soloMesActual = esSistema
                  ? esColumnaCerradaSistema(col.nombre)
                  : /solucionado/i.test(col.nombre) && !/sin solu/i.test(col.nombre);
                const mesActualG = mesKey(new Date());
                const mesCerradoG = mesAnteriorKey(new Date());

                const ordenadas = ordenManual
                  ? col.tarjetas
                  : [...col.tarjetas].sort((a, b) => {
                      const da = subtitleField ? parseDate(a.campos[subtitleField.k]) : null;
                      const db = subtitleField ? parseDate(b.campos[subtitleField.k]) : null;
                      return (db?.getTime() ?? 0) - (da?.getTime() ?? 0);
                    });

                const tarjetasVisibles = soloMesActual
                  ? ordenadas.filter((card) => {
                      const d = subtitleField ? parseDate(card.campos[subtitleField.k]) : null;
                      if (!d) return true;
                      const mk = mesKey(d);
                      return esSistema ? mk === mesActualG : mk === mesActualG || mk === mesCerradoG;
                    })
                  : ordenadas;
                return (
                  <div
                    key={col.id}
                    className="bg-[#161616] border border-zinc-800 rounded-xl w-72 shrink-0 flex flex-col max-h-[calc(100vh-220px)]"
                    onDragOver={(e) => {
                      e.preventDefault();
                      const dc = dragCard.current;
                      if (!dc) return;
                      // hueco vacío debajo de la última tarjeta (o columna vacía): mandar al final
                      const cardEls = Array.from(
                        e.currentTarget.querySelectorAll<HTMLElement>("[data-card-id]")
                      );
                      const last = cardEls[cardEls.length - 1];
                      if (!last) {
                        setHoverSlot({ colId: col.id, index: 0 });
                      } else if (e.clientY > last.getBoundingClientRect().bottom) {
                        setHoverSlot({ colId: col.id, index: col.tarjetas.length });
                      }
                    }}
                    onDrop={() => finalizarDrop()}
                  >
                    <div
                      className="flex items-center justify-between px-3 py-2 border-b border-zinc-800"
                      draggable
                      onDragStart={() => (dragCol.current = { id: col.id })}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragCard.current) setHoverSlot({ colId: col.id, index: 0 });
                      }}
                      onDrop={(e) => {
                        e.stopPropagation();
                        if (dragCard.current) finalizarDrop();
                        dragCol.current = null;
                      }}
                    >
                      <button
                        className="text-sm font-semibold text-zinc-200 truncate text-left flex-1"
                        onClick={() => renombrarColumna(col)}
                        title="Click para renombrar"
                      >
                        {col.nombre}{" "}
                        <span className="text-zinc-500 font-normal">
                          ({tarjetasVisibles.length}
                          {soloMesActual && tarjetasVisibles.length !== col.tarjetas.length
                            ? ` de ${col.tarjetas.length}`
                            : ""}
                          )
                        </span>
                      </button>
                      <div className="flex items-center gap-0.5 text-zinc-500">
                        <button
                          onClick={() => moverColumna(tablero.id, col.id, -1)}
                          className="hover:text-zinc-200 px-1"
                          title="Mover izquierda"
                        >
                          ◀
                        </button>
                        <button
                          onClick={() => moverColumna(tablero.id, col.id, 1)}
                          className="hover:text-zinc-200 px-1"
                          title="Mover derecha"
                        >
                          ▶
                        </button>
                        <button
                          onClick={() => borrarColumna(col)}
                          className="hover:text-red-400 px-1"
                          title="Borrar columna"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 scrollbar-hide">
                      {tarjetasVisibles.map((card) => {
                        const cardIdx = col.tarjetas.findIndex((tj) => tj.id === card.id);
                        const txt = String(card.campos[titleKey] || "(sin descripción)");
                        const [first, ...rest] = txt.split("\n");
                        const sinUbicacion = tablero.clave === "sistema" && !card.campos.ubicacion;
                        const sinCategoria = tablero.clave === "sistema" && !card.campos.categoria;
                        return (
                          <Fragment key={card.id}>
                            {hoverSlot?.colId === col.id && hoverSlot.index === cardIdx && (
                              <div className="h-14 shrink-0 rounded-lg border-2 border-dashed border-rose-500/50 bg-rose-500/5" />
                            )}
                            <div
                              data-card-id={card.id}
                              draggable
                              onDragStart={(e) => {
                                dragCard.current = { id: card.id, fromColId: col.id };
                                setDraggingCardId(card.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => finalizarDrop()}
                              onDragOver={(e) => {
                                e.preventDefault();
                                const dc = dragCard.current;
                                if (!dc || dc.id === card.id) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const before = e.clientY < rect.top + rect.height / 2;
                                setHoverSlot({ colId: col.id, index: before ? cardIdx : cardIdx + 1 });
                              }}
                              onDrop={(e) => {
                                e.stopPropagation();
                                finalizarDrop();
                              }}
                              onClick={() =>
                                setModalTarjeta({
                                  tarjeta: card,
                                  columnaId: col.id,
                                  clave: tablero.clave,
                                  tableroId: tablero.id,
                                })
                              }
                              className={`group border rounded-lg p-2.5 cursor-pointer transition-all duration-150 ${
                                sinUbicacion ? "bg-rose-950/40" : sinCategoria ? "bg-amber-950/40" : "bg-[#1f1f1f]"
                              } ${
                                draggingCardId === card.id
                                  ? "opacity-40 scale-95 rotate-1 border-rose-500 shadow-lg shadow-black/50"
                                  : "border-zinc-800 hover:border-zinc-600"
                              }`}
                            >
                              <p className="text-sm text-zinc-100 whitespace-pre-line">{first}</p>
                              {rest.length > 0 && (
                                <div
                                  className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                                    draggingCardId == null
                                      ? "grid-rows-[0fr] group-hover:grid-rows-[1fr]"
                                      : "grid-rows-[0fr]"
                                  }`}
                                >
                                  <p className="overflow-hidden text-sm text-zinc-300 whitespace-pre-line">
                                    {rest.join("\n")}
                                  </p>
                                </div>
                              )}
                              {subtitleField && card.campos[subtitleField.k] && (
                                <p className="text-xs text-zinc-500 mt-1">
                                  {card.campos[subtitleField.k]}
                                </p>
                              )}
                            </div>
                          </Fragment>
                        );
                      })}
                      {hoverSlot?.colId === col.id && hoverSlot.index === col.tarjetas.length && (
                        <div className="h-14 shrink-0 rounded-lg border-2 border-dashed border-rose-500/50 bg-rose-500/5" />
                      )}
                    </div>

                    <button
                      onClick={() =>
                        setModalTarjeta({
                          tarjeta: null,
                          columnaId: col.id,
                          clave: tablero.clave,
                          tableroId: tablero.id,
                        })
                      }
                      className="text-xs text-zinc-500 hover:text-zinc-200 px-3 py-2 text-left border-t border-zinc-800"
                    >
                      ＋ Agregar tarjeta
                    </button>
                  </div>
                );
              })}

              <button
                onClick={crearColumna}
                className="shrink-0 w-56 h-12 self-start rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-500 text-sm"
              >
                ＋ Agregar columna
              </button>
            </div>
          </>
        ) : null}
      </main>

      {modalTarjeta && (
        <ModalTarjeta
          modal={modalTarjeta}
          tableros={tableros}
          onClose={() => setModalTarjeta(null)}
          onSave={guardarTarjeta}
          onDelete={modalTarjeta.tarjeta ? () => borrarTarjeta(modalTarjeta.tarjeta!.id) : undefined}
        />
      )}

      {unificarAbierto && tablero && (
        <ModalUnificar
          tablero={tablero}
          onClose={() => setUnificarAbierto(false)}
          onDone={cargar}
        />
      )}
    </div>
  );
}

export function Combobox({
  value,
  options,
  placeholder,
  onChange,
  autoFocus,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const openDropdown = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      // ignorar el scroll interno de la propia lista (rueda del mouse sobre las opciones)
      if (dropRef.current && e.target instanceof Node && dropRef.current.contains(e.target)) return;
      setOpen(false);
    };
    // se cierra si el modal (u otro ancestro, no la lista) scrollea, para no quedar mal ubicado
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const q = value.trim().toLowerCase();
  const filtradas = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  return (
    <div className="relative flex-1 min-w-0" ref={wrapRef}>
      <Input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        name={`cb-${placeholder}`}
        data-1p-ignore
        autoFocus={autoFocus}
        onFocus={openDropdown}
        onClick={openDropdown}
        onChange={(e) => {
          onChange(e.target.value);
          openDropdown();
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (!open || filtradas.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(filtradas.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            onChange(filtradas[highlight]);
            setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && filtradas.length > 0 && pos &&
        createPortal(
          <div
            ref={dropRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-50 max-h-48 overflow-y-auto bg-[#1f1f1f] border border-zinc-700 rounded-md shadow-lg"
          >
            {filtradas.map((o, i) => (
              <button
                key={o}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className={`block w-full text-left px-3 py-1.5 text-sm truncate ${
                  i === highlight ? "bg-zinc-700 text-white" : "text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {o}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

function ModalTarjeta({
  modal,
  onClose,
  onSave,
  onDelete,
}: {
  modal: { tarjeta: Tarjeta | null; columnaId: number; clave: string; tableroId: number };
  tableros: Tablero[];
  onClose: () => void;
  onSave: (campos: Campos) => void;
  onDelete?: () => void;
}) {
  const schema = schemaFor(modal.clave);
  const primerCampo = schema.fields.find((f) => !f.auto)?.k;
  const [campos, setCampos] = useState<Campos>(modal.tarjeta?.campos ?? {});
  // Opciones dinámicas de los selects "extensibles" (categoría, ubicación), por campo.
  const [opcionesExtra, setOpcionesExtra] = useState<Record<string, string[]>>({});

  useEffect(() => {
    apiJson(`/api/sistema/opciones?clave=${encodeURIComponent(modal.clave)}`)
      .then(setOpcionesExtra)
      .catch(() => {});
  }, [modal.clave]);

  const agregarOpcion = async (campo: string, label: string) => {
    const valor = window.prompt(`Nueva opción para "${label}":`);
    if (!valor || !valor.trim()) return;
    const v = valor.trim();
    try {
      const lista = await apiJson("/api/sistema/opciones", {
        method: "POST",
        body: JSON.stringify({ clave: modal.clave, campo, valor: v }),
      });
      setOpcionesExtra((p) => ({ ...p, [campo]: lista }));
    } catch {
      setOpcionesExtra((p) => ({ ...p, [campo]: Array.from(new Set([...(p[campo] ?? []), v])) }));
    }
    setCampos((c) => ({ ...c, [campo]: v }));
  };

  // Nota: ya no se registra automáticamente al guardar lo tipeado a mano en un
  // select "extensible" — eso generaba sugerencias basura (typos, valores a medio
  // escribir). Para agregar una opción nueva y persistente hay que usar el botón "+".
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        onSave(campos);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [campos, onClose, onSave]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#161616] border border-zinc-800 rounded-xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-4 text-zinc-100">
          {modal.tarjeta ? "Editar tarjeta" : "Nueva tarjeta"}
        </h2>

        <div className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500 mb-1">
            Fecha: {campos.fecha ? new Date(campos.fecha).toLocaleString() : "—"}
          </p>

          {schema.fields.map((f) => {
            if (f.auto) return null;
            // Opciones fijas del schema (curadas) + las extensibles persistidas
            // (opcionesExtra, ej. ubicación) + el valor actual (para no vaciarlo al editar).
            const valorActual = campos[f.k];
            const combinedOptions =
              f.t === "select"
                ? (() => {
                    const arr = Array.from(
                      new Set([
                        ...(f.opciones ?? []),
                        ...(f.extensible ? opcionesExtra[f.k] ?? [] : []),
                        ...(valorActual ? [String(valorActual)] : []),
                      ])
                    );
                    // Extensibles (ubicación, categoría) se muestran alfabéticas; las de
                    // orden fijo (ej. importancia) mantienen su orden original.
                    return f.extensible ? arr.sort((a, b) => a.localeCompare(b, "es")) : arr;
                  })()
                : [];
            return (
              <div key={f.k}>
                <label className="text-xs text-zinc-500 mb-1 block">{f.l}</label>
                {f.t === "textarea" ? (
                  <Textarea
                    value={campos[f.k] ?? ""}
                    autoFocus={!modal.tarjeta && f.k === primerCampo}
                    onChange={(e) => setCampos((c) => ({ ...c, [f.k]: e.target.value }))}
                  />
                ) : f.t === "select" ? (
                  <div className="flex gap-2">
                    <Combobox
                      value={String(campos[f.k] ?? "")}
                      options={combinedOptions}
                      placeholder="Escribí para buscar o crear…"
                      autoFocus={!modal.tarjeta && f.k === primerCampo}
                      onChange={(v) => setCampos((c) => ({ ...c, [f.k]: v }))}
                    />
                    {f.extensible && (
                      <button
                        type="button"
                        onClick={() => agregarOpcion(f.k, f.l)}
                        className="shrink-0 w-9 rounded-md border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 text-sm"
                        title={`Agregar ${f.l.toLowerCase()}`}
                      >
                        ＋
                      </button>
                    )}
                  </div>
                ) : (
                  <Input
                    type="text"
                    value={campos[f.k] ?? ""}
                    autoFocus={!modal.tarjeta && f.k === primerCampo}
                    onChange={(e) => setCampos((c) => ({ ...c, [f.k]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-5">
          {onDelete ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Borrar
            </Button>
          ) : (
            <span />
          )}
          <p className="text-[11px] text-zinc-500">Esc cancela · Ctrl+Enter guarda</p>
        </div>
      </div>
    </div>
  );
}

function ModalUnificar({
  tablero,
  onClose,
  onDone,
}: {
  tablero: Tablero;
  onClose: () => void;
  onDone: () => void;
}) {
  const schema = schemaFor(tablero.clave);
  const camposUnificables = schema.fields.filter((f) => f.t === "select" && f.extensible);
  const [campo, setCampo] = useState(camposUnificables[0]?.k ?? "");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  const todasLasTarjetas = tablero.columnas.flatMap((c) => c.tarjetas);

  const conteos = Array.from(
    todasLasTarjetas.reduce((map, t) => {
      const v = String(t.campos[campo] ?? "").trim();
      if (!v) return map;
      map.set(v, (map.get(v) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).sort((a, b) => a[0].localeCompare(b[0], "es"));

  const toggle = (valor: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(valor)) next.delete(valor);
      else next.add(valor);
      return next;
    });
    setError("");
  };

  const unificar = async () => {
    if (seleccion.size < 2) {
      setError("Elegí al menos 2 valores para unificar.");
      return;
    }
    const destinoFinal = destino.trim() || Array.from(seleccion)[0];
    setTrabajando(true);
    setError("");
    try {
      const cambios = todasLasTarjetas.filter(
        (t) => seleccion.has(String(t.campos[campo] ?? "").trim()) && t.campos[campo] !== destinoFinal
      );
      for (const t of cambios) {
        await apiJson(`/api/sistema/tarjetas/${t.id}`, {
          method: "PATCH",
          body: JSON.stringify({ campos: { ...t.campos, [campo]: destinoFinal } }),
        });
      }
      await apiJson("/api/sistema/opciones", {
        method: "POST",
        body: JSON.stringify({ clave: tablero.clave, campo, valor: destinoFinal }),
      }).catch(() => {});
      for (const v of seleccion) {
        if (v === destinoFinal) continue;
        await apiJson("/api/sistema/opciones", {
          method: "DELETE",
          body: JSON.stringify({ clave: tablero.clave, campo, valor: v }),
        }).catch(() => {});
      }
      onDone();
      onClose();
    } catch {
      setError("Algo falló a mitad de camino. Revisá y reintentá si hace falta.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#161616] border border-zinc-800 rounded-xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-1 text-zinc-100">Unificar valores duplicados</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Ej: &quot;pc mangueras&quot; y &quot;pc manguera&quot; → elegí ambos y definí el nombre final.
        </p>

        {camposUnificables.length > 1 && (
          <div className="mb-3">
            <label className="text-xs text-zinc-500 mb-1 block">Campo</label>
            <select
              value={campo}
              onChange={(e) => {
                setCampo(e.target.value);
                setSeleccion(new Set());
                setDestino("");
              }}
              className="w-full bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100"
            >
              {camposUnificables.map((f) => (
                <option key={f.k} value={f.k}>
                  {f.l}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1 mb-3 max-h-64 overflow-y-auto border border-zinc-800 rounded-md p-2">
          {conteos.length === 0 && (
            <p className="text-xs text-zinc-600 px-1 py-2">No hay valores cargados en este campo.</p>
          )}
          {conteos.map(([valor, n]) => (
            <label
              key={valor}
              className="flex items-center gap-2 text-sm text-zinc-200 px-2 py-1.5 rounded hover:bg-zinc-800/60 cursor-pointer"
            >
              <input type="checkbox" checked={seleccion.has(valor)} onChange={() => toggle(valor)} />
              <span className="flex-1 truncate">{valor}</span>
              <span className="text-xs text-zinc-500">{n}</span>
            </label>
          ))}
        </div>

        <label className="text-xs text-zinc-500 mb-1 block">Nombre final</label>
        <Input
          type="text"
          value={destino}
          placeholder={Array.from(seleccion)[0] ?? "Nombre unificado"}
          onChange={(e) => setDestino(e.target.value)}
        />

        {error && <p className="text-xs text-amber-400 mt-2">{error}</p>}

        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={trabajando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={unificar} disabled={trabajando || seleccion.size < 2}>
            {trabajando ? "Unificando…" : `Unificar (${seleccion.size})`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RuedaMeses({
  opciones,
  selectedIndex,
  onChange,
  orientation,
  visible,
}: {
  opciones: string[];
  selectedIndex: number;
  onChange: (i: number) => void;
  orientation: "vertical" | "horizontal";
  visible: number;
}) {
  const CELL = orientation === "vertical" ? 44 : 88;
  const mid = Math.floor(visible / 2);
  const wheelRef = useRef<HTMLDivElement>(null);
  const wheelLock = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const mover = (delta: number) => {
    onChange(Math.max(0, Math.min(opciones.length - 1, selectedIndex + delta)));
  };
  // ref siempre con la última versión de mover/selectedIndex para el listener nativo.
  const moverRef = useRef(mover);
  moverRef.current = mover;

  // El onWheel de React se registra como passive y no puede frenar el scroll de
  // la página. Por eso el listener va nativo, con { passive: false }.
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelLock.current) return;
      wheelLock.current = true;
      const delta = orientation === "horizontal" && Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      moverRef.current(delta > 0 ? 1 : -1);
      setTimeout(() => {
        wheelLock.current = false;
      }, 160);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [orientation]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = touchStartY.current == null ? 0 : e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (orientation === "horizontal") {
      if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy)) return;
      mover(dx < 0 ? 1 : -1);
    } else {
      if (Math.abs(dy) < 24 || Math.abs(dy) < Math.abs(dx)) return;
      mover(dy < 0 ? 1 : -1);
    }
  };

  const etiquetaChica = (m: string) => (m === "todos" ? "Todos" : mesLabelCorto(m));
  const etiquetaGrande = (m: string) => (m === "todos" ? "Todos" : mesLabel(m));

  const vertical = orientation === "vertical";

  return (
    <div
      className={
        vertical
          ? "fixed right-4 top-1/2 -translate-y-1/2 z-30 hidden lg:flex flex-col items-center gap-1 select-none"
          : "sticky top-14 z-20 flex lg:hidden items-center justify-center gap-1 select-none bg-[#0d0d0d]/95 backdrop-blur -mx-6 px-6 py-2 mb-3 border-b border-zinc-800"
      }
    >
      <button
        onClick={() => mover(-1)}
        className="text-zinc-600 hover:text-zinc-200 text-xs leading-none px-1 shrink-0"
        title="Mes más reciente"
      >
        {vertical ? "▲" : "◀"}
      </button>

      <div
        ref={wheelRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative overflow-hidden"
        style={vertical ? { width: 116, height: CELL * visible } : { width: CELL * visible, height: 52 }}
      >
        {/* ventana central, como la mirilla de una rueda de candado */}
        <div
          className={
            "pointer-events-none absolute bg-white/[0.03] " +
            (vertical ? "left-0 right-0 border-y border-zinc-700/70" : "top-0 bottom-0 border-x border-zinc-700/70")
          }
          style={vertical ? { top: CELL * mid, height: CELL } : { left: CELL * mid, width: CELL }}
        />
        <div
          className={`absolute transition-transform duration-300 ease-out ${
            vertical ? "left-0 right-0 flex flex-col" : "top-0 bottom-0 flex flex-row"
          }`}
          style={{
            transform: vertical
              ? `translateY(${(mid - selectedIndex) * CELL}px)`
              : `translateX(${(mid - selectedIndex) * CELL}px)`,
          }}
        >
          {opciones.map((m, i) => {
            const dist = Math.abs(i - selectedIndex);
            const estilo =
              dist === 0
                ? "text-base font-bold text-rose-400 scale-110"
                : dist === 1
                ? "text-xs text-zinc-300"
                : "text-[10px] text-zinc-600";
            return (
              <button
                key={m}
                onClick={() => onChange(i)}
                style={vertical ? { height: CELL } : { width: CELL }}
                className={`shrink-0 flex items-center justify-center text-center px-1 transition-all duration-200 ${estilo}`}
              >
                {dist === 0 ? etiquetaGrande(m) : etiquetaChica(m)}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => mover(1)}
        className="text-zinc-600 hover:text-zinc-200 text-xs leading-none px-1 shrink-0"
        title="Mes más antiguo"
      >
        {vertical ? "▼" : "▶"}
      </button>
    </div>
  );
}

function Kpi({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-[#161616] border border-zinc-800 rounded-xl p-4">
      <div className="text-2xl font-bold text-rose-400">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function ChartBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#161616] border border-zinc-800 rounded-xl p-4 h-72">
      <h4 className="text-sm text-zinc-300 mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function PanelUbicacion({
  name,
  cards,
  offset,
  onClose,
}: {
  name: string;
  cards: CardM[];
  offset: number;
  onClose: () => void;
}) {
  const [entrado, setEntrado] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntrado(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="absolute bg-[#1f1f1f] border border-zinc-700 rounded-xl shadow-2xl shadow-black/60 p-3 w-full transition-all duration-300 ease-out overflow-y-auto scrollbar-hide"
      style={{
        top: offset * 14,
        left: offset * 10,
        right: -offset * 4,
        zIndex: 20 + offset,
        maxHeight: 280,
        transform: entrado ? "translateX(0)" : "translateX(48px)",
        opacity: entrado ? 1 : 0,
      }}
    >
      <div className="flex items-center justify-between mb-2 sticky top-0 bg-[#1f1f1f]">
        <h5 className="text-sm font-semibold text-zinc-100 truncate">{name}</h5>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-500">{cards.length}</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-rose-400 text-xs" title="Cerrar">
            ✕
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <div key={c.id} className="bg-[#161616] border border-zinc-800 rounded-lg p-2">
            <p className="text-xs text-zinc-200 whitespace-pre-line">{c.campos.descripcion}</p>
            <p className="text-[10px] text-zinc-500 mt-1">
              {c.campos.categoria || "—"} · {c.campos.importancia || "—"} · {c.colNombre}
            </p>
          </div>
        ))}
        {cards.length === 0 && <p className="text-xs text-zinc-600">Sin tarjetas.</p>}
      </div>
    </div>
  );
}

type CardM = Tarjeta & { colNombre: string };

function Metricas({ tableros }: { tableros: Tablero[] }) {
  // aplanar todas las tarjetas con su columna; deduplicar por id.
  const all: CardM[] = tableros.flatMap((t) =>
    t.columnas.flatMap((c) => c.tarjetas.map((tj) => ({ ...tj, colNombre: c.nombre })))
  );
  const unicasAll = Array.from(new Map(all.map((tj) => [tj.id, tj])).values());

  const claveDe = (tableroId: number) => tableros.find((t) => t.id === tableroId)?.clave;
  const fechaDe = (tj: CardM) => parseDate(tj.campos[fechaFieldFor(claveDe(tj.tableroId))]);

  const mesActual = mesKey(new Date());
  const mesesCerrados = Array.from(
    new Set(unicasAll.map(fechaDe).filter((d): d is Date => !!d).map(mesKey))
  )
    .filter((m) => m < mesActual)
    .sort()
    .reverse();

  // opciones[0] = "todos"; opciones[1] = mes en curso; resto = meses cerrados (desc).
  const opciones = ["todos", mesActual, ...mesesCerrados];
  const [selectedIndex, setSelectedIndex] = useState(1); // arranca en el mes actual
  const idx = Math.max(0, Math.min(opciones.length - 1, selectedIndex));
  const mes = opciones[idx];

  const [pilaUbicacion, setPilaUbicacion] = useState<string[]>([]);
  const toggleUbicacion = (name: string) =>
    setPilaUbicacion((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const unicas =
    mes === "todos"
      ? unicasAll
      : unicasAll.filter((tj) => {
          const d = fechaDe(tj);
          return d && mesKey(d) === mes;
        });

  const idDe = (clave: string) => tableros.find((t) => t.clave === clave)?.id;
  const cardsDe = (id?: number) => (id == null ? [] : unicas.filter((tj) => tj.tableroId === id));

  const totalCards = unicas.length;

  const porEmpresa = tableros.map((t) => ({ name: t.nombre, value: cardsDe(t.id).length }));

  // ----- métricas específicas existentes (si los tableros existen) -----
  const sCards = cardsDe(idDe("sistema"));
  const sfCards = cardsDe(idDe("softech"));
  const bCards = cardsDe(idDe("buren"));

  const solvedCount = sfCards.filter(
    (c) => /solucionado/i.test(c.colNombre) && !/sin solu/i.test(c.colNombre)
  ).length;
  const pctSolved = sfCards.length ? Math.round((solvedCount / sfCards.length) * 100) : 0;

  const diffs: number[] = [];
  for (const c of sfCards) {
    const a = parseDate(c.campos.inicio);
    const b = parseDate(c.campos.fin);
    if (a && b) diffs.push(Math.max(0, (b.getTime() - a.getTime()) / 86400000));
  }
  const avgDays = diffs.length ? (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1) : "—";

  const totalMin = bCards.reduce((acc, c) => acc + timeToMinutes(c.campos.tiempo), 0);
  const totalHrsLabel = `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;

  const sisPorEstado = countBy(sCards, (c) => c.colNombre);
  const sisPorCategoria = countBy(sCards, (c) => c.campos.categoria).sort((a, b) => b.value - a.value);
  const sisPorUbicacion = countBy(sCards, (c) => c.campos.ubicacion).sort((a, b) => b.value - a.value);
  const topCategoria = sisPorCategoria[0];
  const topUbicacion = sisPorUbicacion[0];
  const sfPorEstado = countBy(sfCards, (c) => c.colNombre);
  const sfPorSistema = countBy(sfCards, (c) => c.campos.sistema);
  const burenPorUbic = countBy(bCards, (c) => c.campos.ubicacion);

  return (
    <div>
      {/* mobile/tablet: rueda horizontal arriba, 3 meses visibles */}
      <RuedaMeses
        opciones={opciones}
        selectedIndex={idx}
        onChange={setSelectedIndex}
        orientation="horizontal"
        visible={3}
      />
      {/* desktop: rueda fija a la derecha, 5 meses visibles */}
      <RuedaMeses
        opciones={opciones}
        selectedIndex={idx}
        onChange={setSelectedIndex}
        orientation="vertical"
        visible={5}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi value={totalCards} label="Casos totales registrados" />
        <Kpi value={`${pctSolved}%`} label="Softech resuelto" />
        <Kpi value={avgDays} label="Softech: días promedio de resolución" />
        <Kpi
          value={topCategoria ? topCategoria.name : "—"}
          label={`Categoría más frecuente — Sistema${topCategoria ? ` (${topCategoria.value})` : ""}`}
        />
        <Kpi
          value={topUbicacion ? topUbicacion.name : "—"}
          label={`Ubicación más frecuente — Sistema${topUbicacion ? ` (${topUbicacion.value})` : ""}`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ChartBox title="Casos por empresa (cuenta a quién corresponde)">
          <BarChart data={porEmpresa}>
            <CartesianGrid stroke="#27272a" />
            <XAxis dataKey="name" stroke="#9aa1b1" fontSize={12} />
            <YAxis stroke="#9aa1b1" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
            <Bar dataKey="value">
              {porEmpresa.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartBox>

        <ChartBox title="Buren: tiempo total sin servicio">
          <BarChart data={burenPorUbic}>
            <CartesianGrid stroke="#27272a" />
            <XAxis dataKey="name" stroke="#9aa1b1" fontSize={12} />
            <YAxis stroke="#9aa1b1" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
            <Bar dataKey="value">
              {burenPorUbic.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartBox>

        <ChartBox title="Sistema interno — por estado">
          <PieChart>
            <Pie data={sisPorEstado} dataKey="value" nameKey="name" outerRadius={80}>
              {sisPorEstado.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11, color: "#9aa1b1" }} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
          </PieChart>
        </ChartBox>

        <ChartBox title="Sistema interno — por categoría">
          <PieChart>
            <Pie data={sisPorCategoria} dataKey="value" nameKey="name" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
              {sisPorCategoria.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11, color: "#9aa1b1" }} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
          </PieChart>
        </ChartBox>

        <div className="bg-[#161616] border border-zinc-800 rounded-xl p-4 md:col-span-2 lg:col-span-3">
          <h4 className="text-sm text-zinc-300 mb-2">
            Sistema interno — por ubicación{" "}
            <span className="text-zinc-600 font-normal">(clic en una barra para ver el detalle)</span>
          </h4>
          <div className="flex flex-col md:flex-row gap-4">
            <div style={{ width: "100%", maxWidth: 420, height: Math.max(260, sisPorUbicacion.length * 26) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sisPorUbicacion} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid stroke="#27272a" horizontal={false} />
                  <XAxis type="number" stroke="#9aa1b1" fontSize={12} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#9aa1b1" fontSize={11} width={110} />
                  <Tooltip
                    cursor={{ fill: "#ffffff0d" }}
                    contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(d: any) => toggleUbicacion(d.name)}
                  >
                    {sisPorUbicacion.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={PALETTE[i % PALETTE.length]}
                        stroke={pilaUbicacion.includes(entry.name) ? "#fff" : "none"}
                        strokeWidth={pilaUbicacion.includes(entry.name) ? 2 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div
              className="relative flex-1"
              style={{ minHeight: Math.max(180, Math.min(260, sisPorUbicacion.length * 26)) }}
            >
              {pilaUbicacion.length === 0 ? (
                <p className="text-xs text-zinc-600 h-full flex items-center">
                  Elegí una ubicación en el gráfico para ver sus tarjetas acá.
                </p>
              ) : (
                pilaUbicacion.map((name, i) => (
                  <PanelUbicacion
                    key={name}
                    name={name}
                    cards={sCards.filter((c) => (c.campos.ubicacion || "(sin dato)") === name)}
                    offset={i}
                    onClose={() => toggleUbicacion(name)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <ChartBox title="Softech — por estado">
          <PieChart>
            <Pie data={sfPorEstado} dataKey="value" nameKey="name" outerRadius={80}>
              {sfPorEstado.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11, color: "#9aa1b1" }} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
          </PieChart>
        </ChartBox>

        <ChartBox title="Softech — sistema afectado">
          <BarChart data={sfPorSistema}>
            <CartesianGrid stroke="#27272a" />
            <XAxis dataKey="name" stroke="#9aa1b1" fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis stroke="#9aa1b1" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
            <Bar dataKey="value">
              {sfPorSistema.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartBox>
      </div>

      <p className="text-xs text-zinc-600 mt-4">
        Total sin servicio (Buren): {totalHrsLabel}.
      </p>
    </div>
  );
}
