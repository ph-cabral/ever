"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
// type CampoDef = {
//   k: string;
//   l: string;
//   t: "text" | "textarea" | "date" | "select";
//   opciones?: string[];
//   auto?: boolean;
// };
type Campos = Record<string, string | null>;
type Tarjeta = { id: number; columnaId: number; orden: number; campos: Campos };
type Columna = { id: number; tableroId: number; nombre: string; orden: number; tarjetas: Tarjeta[] };
type Tablero = { id: number; clave: string; nombre: string; columnas: Columna[] };
type CampoDef = {
  k: string;
  l: string;
  t: "text" | "textarea" | "date" | "select";
  opciones?: string[];
  auto?: boolean;
};
// type CampoDef = { k: string; l: string; t: "text" | "textarea" | "date" };
const SCHEMAS: Record<string, { titleKey: string; fields: CampoDef[] }> = {
  sistema: {
    titleKey: "descripcion",
    fields: [
      { k: "fecha", l: "Fecha", t: "date", auto: true },
      { k: "descripcion", l: "Problema / solución", t: "textarea" },
      { k: "ubicacion", l: "Ubicación", t: "text" },
      {
        k: "categoria",
        l: "Categoría",
        t: "select",
        opciones: [
          "Impresoras",
          "Automatización",
          "Mantenimiento de equipos",
          "Varios",
        ],
      },
      {
        k: "importancia",
        l: "Importancia",
        t: "select",
        opciones: ["Alta", "Media", "Baja"],
      },
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

const PALETTE = ["#5b8def", "#7c5bef", "#3ecf8e", "#e0b341", "#e0556b", "#3ec7cf", "#cf8de0"];

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
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

async function apiJson(url: string, opts?: RequestInit) {
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

  const [modalTarjeta, setModalTarjeta] = useState<{
    tarjeta: Tarjeta | null; // null = creando
    columnaId: number;
    clave: string;
  } | null>(null);

  const dragCard = useRef<{ id: number } | null>(null);
  const dragCol = useRef<{ id: number } | null>(null);

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

  // ---------- columnas ----------
  const crearColumna = async (tableroId: number) => {
    const nombre = window.prompt("Nombre de la nueva columna:");
    if (!nombre || !nombre.trim()) return;
    await apiJson("/api/sistema/columnas", {
      method: "POST",
      body: JSON.stringify({ tableroId, nombre: nombre.trim() }),
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
    if (!window.confirm(`¿Borrar columna "${col.nombre}"? Las tarjetas se mueven a otra columna.`)) return;
    const r = await fetch(`/api/sistema/columnas/${col.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || "No se pudo borrar la columna.");
    }
    cargar();
  };

  const moverColumna = (tableroId: number, colId: number, dir: -1 | 1) => {
    const t = tableros.find((x) => x.id === tableroId);
    if (!t) return;
    const cols = [...t.columnas];
    const idx = cols.findIndex((c) => c.id === colId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= cols.length) return;
    [cols[idx], cols[j]] = [cols[j], cols[idx]];
    setTableros((prev) => prev.map((x) => (x.id === tableroId ? { ...x, columnas: cols } : x)));
    apiJson("/api/sistema/columnas/reorder", {
      method: "PATCH",
      body: JSON.stringify({ orden: cols.map((c) => c.id) }),
    }).catch(() => cargar());
  };

  // ---------- tarjetas ----------
  const moverTarjeta = (cardId: number, destColumnaId: number, destIndex: number) => {
    const tcopy: Tablero[] = tableros.map((t) => ({
      ...t,
      columnas: t.columnas.map((c) => ({ ...c, tarjetas: [...c.tarjetas] })),
    }));

    let card: Tarjeta | undefined;
    let srcCol: Columna | undefined;
    for (const t of tcopy)
      for (const c of t.columnas) {
        const idx = c.tarjetas.findIndex((tj) => tj.id === cardId);
        if (idx >= 0) {
          card = c.tarjetas[idx];
          srcCol = c;
          c.tarjetas.splice(idx, 1);
        }
      }
    if (!card || !srcCol) return;

    let destCol: Columna | undefined;
    for (const t of tcopy) for (const c of t.columnas) if (c.id === destColumnaId) destCol = c;
    if (!destCol) return;

    const idx = Math.max(0, Math.min(destIndex, destCol.tarjetas.length));
    // destCol.tarjetas.splice(idx, 0, { ...card, columnaId: destColumnaId });
    destCol.tarjetas.splice(idx, 0, {
      ...card,
      columnaId: destColumnaId,
      campos:
        destCol.id !== srcCol.id
          ? { ...card.campos, fecha: new Date().toISOString() }
          : card.campos,
    });

    const cambios: { id: number; columnaId: number; orden: number }[] = [];
    srcCol.tarjetas.forEach((tj, i) => {
      tj.orden = i;
      cambios.push({ id: tj.id, columnaId: srcCol!.id, orden: i });
    });
    if (destCol.id !== srcCol.id) {
      destCol.tarjetas.forEach((tj, i) => {
        tj.orden = i;
        cambios.push({ id: tj.id, columnaId: destCol!.id, orden: i });
      });
    }

    setTableros(tcopy);
    if (cambios.length) {
      apiJson("/api/sistema/tarjetas/reorder", {
        method: "PATCH",
        body: JSON.stringify({ cambios }),
      }).catch(() => cargar());
    }
  };

  const borrarTarjeta = async (id: number) => {
    if (!window.confirm("¿Borrar esta tarjeta?")) return;
    await fetch(`/api/sistema/tarjetas/${id}`, { method: "DELETE" });
    setModalTarjeta(null);
    cargar();
  };

  // const guardarTarjeta = async (campos: Campos) => {
  //   if (!modalTarjeta) return;
  //   if (modalTarjeta.tarjeta) {
  //     await apiJson(`/api/sistema/tarjetas/${modalTarjeta.tarjeta.id}`, {
  //       method: "PATCH",
  //       body: JSON.stringify({ campos }),
  //     });
  //   } else {
  //     await apiJson("/api/sistema/tarjetas", {
  //       method: "POST",
  //       body: JSON.stringify({ columnaId: modalTarjeta.columnaId, campos }),
  //     });
  //   }
  //   setModalTarjeta(null);
  //   cargar();
  // };
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
          campos: { ...campos, fecha: new Date().toISOString() },
        }),
      });
    }
    setModalTarjeta(null);
    cargar();
  };

  if (cargando) {
    return <div className="min-h-screen bg-[#0d0d0d] text-zinc-400 flex items-center justify-center">Cargando…</div>;
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="sticky top-0 z-20 bg-[#151515] border-b border-zinc-800 px-6 h-14 flex items-center gap-4">
        <Link href="/" className="text-zinc-400 hover:text-white text-sm">
          ← Inicio
        </Link>
        <h1 className="font-bold text-rose-500 text-lg">Sistema</h1>
        {msg && <span className="text-amber-400 text-sm ml-4">{msg}</span>}
      </header>

      <nav className="bg-[#1a1a1a] border-b border-zinc-800 px-6 flex gap-1">
        {tableros.map((t) => (
          <button
            key={t.clave}
            onClick={() => setTab(t.clave)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.clave
                ? "text-rose-400 border-rose-500"
                : "text-zinc-500 border-transparent hover:text-zinc-200"
            }`}
          >
            {t.nombre}
          </button>
        ))}
        <button
          onClick={() => setTab("metricas")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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
          <div className="flex gap-4 overflow-x-auto pb-4">
            {tablero.columnas.map((col) => (
              <div
                key={col.id}
                className="bg-[#161616] border border-zinc-800 rounded-xl w-72 shrink-0 flex flex-col max-h-[calc(100vh-180px)]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragCard.current) moverTarjeta(dragCard.current.id, col.id, col.tarjetas.length);
                  dragCard.current = null;
                }}
              >
                <div
                  className="flex items-center justify-between px-3 py-2 border-b border-zinc-800"
                  draggable
                  onDragStart={() => (dragCol.current = { id: col.id })}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.stopPropagation();
                    dragCol.current = null;
                  }}
                >
                  <button
                    className="text-sm font-semibold text-zinc-200 truncate text-left flex-1"
                    onClick={() => renombrarColumna(col)}
                    title="Click para renombrar"
                  >
                    {col.nombre} <span className="text-zinc-500 font-normal">({col.tarjetas.length})</span>
                  </button>
                  <div className="flex items-center gap-0.5 text-zinc-500">
                    <button onClick={() => moverColumna(tablero.id, col.id, -1)} className="hover:text-zinc-200 px-1" title="Mover izquierda">
                      ◀
                    </button>
                    <button onClick={() => moverColumna(tablero.id, col.id, 1)} className="hover:text-zinc-200 px-1" title="Mover derecha">
                      ▶
                    </button>
                    <button onClick={() => borrarColumna(col)} className="hover:text-red-400 px-1" title="Borrar columna">
                      ✕
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                  {col.tarjetas.map((card) => {
                    const titleKey = SCHEMAS[tablero.clave]?.titleKey ?? "problema";
                    const subtitleField = SCHEMAS[tablero.clave]?.fields.find((f) => f.t === "date");
                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={() => (dragCard.current = { id: card.id })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.stopPropagation();
                          if (dragCard.current && dragCard.current.id !== card.id) {
                            const idx = col.tarjetas.findIndex((c) => c.id === card.id);
                            moverTarjeta(dragCard.current.id, col.id, idx);
                          }
                          dragCard.current = null;
                        }}
                        onClick={() => setModalTarjeta({ tarjeta: card, columnaId: col.id, clave: tablero.clave })}
                        className="bg-[#1f1f1f] border border-zinc-800 rounded-lg p-2.5 cursor-pointer hover:border-zinc-600 transition-colors"
                      >
                        <p className="text-sm text-zinc-100 line-clamp-3">
                          {card.campos[titleKey] || "(sin descripción)"}
                        </p>
                        {subtitleField && card.campos[subtitleField.k] && (
                          <p className="text-xs text-zinc-500 mt-1">{card.campos[subtitleField.k]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setModalTarjeta({ tarjeta: null, columnaId: col.id, clave: tablero.clave })}
                  className="text-xs text-zinc-500 hover:text-zinc-200 px-3 py-2 text-left border-t border-zinc-800"
                >
                  ＋ Agregar tarjeta
                </button>
              </div>
            ))}

            <button
              onClick={() => crearColumna(tablero.id)}
              className="shrink-0 w-56 h-12 self-start rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-500 text-sm"
            >
              ＋ Agregar columna
            </button>
          </div>
        ) : null}
      </main>

      {modalTarjeta && (
        <ModalTarjeta
          modal={modalTarjeta}
          onClose={() => setModalTarjeta(null)}
          onSave={guardarTarjeta}
          onDelete={modalTarjeta.tarjeta ? () => borrarTarjeta(modalTarjeta.tarjeta!.id) : undefined}
        />
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
  modal: { tarjeta: Tarjeta | null; columnaId: number; clave: string };
  onClose: () => void;
  onSave: (campos: Campos) => void;
  onDelete?: () => void;
}) {
  const schema = SCHEMAS[modal.clave] ?? SCHEMAS.sistema;
  const [campos, setCampos] = useState<Campos>(modal.tarjeta?.campos ?? {});

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#161616] border border-zinc-800 rounded-xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-4 text-zinc-100">
          {modal.tarjeta ? "Editar tarjeta" : "Nueva tarjeta"}
        </h2>

        <div className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500 mb-3">
            Fecha:{" "}
            {campos.fecha ? new Date(campos.fecha).toLocaleString() : "—"}
          </p>
          {schema.fields.map((f) => {
            if (f.auto) return null;
            return (
              <div key={f.k}>
                <label className="text-xs text-zinc-500 mb-1 block">
                  {f.l}
                </label>
                {f.t === "textarea" ? (
                  <Textarea
                    value={campos[f.k] ?? ""}
                    onChange={(e) =>
                      setCampos((c) => ({ ...c, [f.k]: e.target.value }))
                    }
                  />
                ) : f.t === "select" ? (
                  <select
                    className="w-full bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100"
                    value={campos[f.k] ?? ""}
                    onChange={(e) =>
                      setCampos((c) => ({ ...c, [f.k]: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {f.opciones?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    value={campos[f.k] ?? ""}
                    onChange={(e) =>
                      setCampos((c) => ({ ...c, [f.k]: e.target.value }))
                    }
                  />
                )}
              </div>
            );
          })}
          {/* {schema.fields.map((f) => (
            <div key={f.k}>
              <label className="text-xs text-zinc-500 mb-1 block">{f.l}</label>
              {f.t === "textarea" ? (
                <Textarea
                  value={campos[f.k] ?? ""}
                  onChange={(e) => setCampos((c) => ({ ...c, [f.k]: e.target.value }))}
                />
              ) : (
                <Input
                  type={f.t === "date" ? "date" : "text"}
                  value={campos[f.k] ?? ""}
                  onChange={(e) => setCampos((c) => ({ ...c, [f.k]: e.target.value }))}
                />
              )}
            </div>
          ))} */}
        </div>

        <div className="flex items-center justify-between mt-5">
          {onDelete ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Borrar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => onSave(campos)}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
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

function Metricas({ tableros }: { tableros: Tablero[] }) {
  const sistema = tableros.find((t) => t.clave === "sistema");
  const softech = tableros.find((t) => t.clave === "softech");
  const buren = tableros.find((t) => t.clave === "buren");

  const sCards = sistema?.columnas.flatMap((c) => c.tarjetas.map((tj) => ({ ...tj, colNombre: c.nombre }))) ?? [];
  const sfCards = softech?.columnas.flatMap((c) => c.tarjetas.map((tj) => ({ ...tj, colNombre: c.nombre }))) ?? [];
  const bCards = buren?.columnas.flatMap((c) => c.tarjetas.map((tj) => ({ ...tj, colNombre: c.nombre }))) ?? [];

  const totalCards = sCards.length + sfCards.length + bCards.length;

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

  const porArea = [
    { name: "Sistema", value: sCards.length },
    { name: "Softech", value: sfCards.length },
    { name: "Buren", value: bCards.length },
  ];
  const sisPorEstado = countBy(sCards, (c) => c.colNombre);
  const sisPorCategoria = countBy(sCards, (c) => c.campos.categoria);
  const sfPorEstado = countBy(sfCards, (c) => c.colNombre);
  const sfPorSistema = countBy(sfCards, (c) => c.campos.sistema);
  const burenPorUbic = countBy(bCards, (c) => c.campos.ubicacion);
  const sisPorImportancia = countBy(sCards, (c) => c.campos.importancia);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi value={totalCards} label="Casos totales registrados" />
        <Kpi value={`${pctSolved}%`} label="Softech resuelto" />
        <Kpi value={avgDays} label="Softech: días promedio de resolución" />
        <Kpi value={totalHrsLabel} label="Buren: tiempo total sin servicio" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ChartBox title="Casos por área">
          <BarChart data={porArea}>
            <CartesianGrid stroke="#27272a" />
            <XAxis dataKey="name" stroke="#9aa1b1" fontSize={12} />
            <YAxis stroke="#9aa1b1" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
            <Bar dataKey="value">
              {porArea.map((_, i) => (
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
          <BarChart data={sisPorCategoria}>
            <CartesianGrid stroke="#27272a" />
            <XAxis dataKey="name" stroke="#9aa1b1" fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis stroke="#9aa1b1" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }} />
            <Bar dataKey="value">
              {sisPorCategoria.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartBox>

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

        <ChartBox title="Buren — por ubicación">
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
      </div>
    </div>
  );
}
