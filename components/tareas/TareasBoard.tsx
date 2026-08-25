"use client";

// Tablero de tareas tipo Trello, reutilizado por /rrhh/tareas y /compras/tarea.
// Es una versión de un solo tablero (sin tabs de múltiples tableros, sin
// vinculación entre tableros, sin métricas ni integraciones tipo Softech/Jira)
// del mismo patrón visual/funcional que app/sistema/SistemaClient.tsx — cada
// área instancia este componente apuntando a su propia API (apiBase), que a su
// vez pega contra sus propias tablas (ver lib/tareas/server.ts). RRHH y
// Compras no comparten datos entre sí ni con /sistema.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  apiJson,
  ordenarTarjetas,
  parseDate,
  SCHEMA_TAREA,
  type Campos,
  type Columna,
  type CriterioOrden,
  type TableroData,
  type Tarjeta,
} from "@/lib/tareas/types";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

const CRITERIOS: { v: CriterioOrden; l: string; hint: string }[] = [
  { v: "POSICION", l: "Orden manual", hint: "arrastrar y soltar" },
  { v: "CREACION", l: "Orden de creación", hint: "más antigua primero" },
  { v: "IMPORTANCIA", l: "Por importancia", hint: "Alta → Media → Baja" },
];

export type Accent = {
  text: string; // ej. "text-indigo-400"
  border: string; // ej. "border-indigo-500"
  ring: string; // ej. "ring-indigo-500/60"
};

export function TareasBoard({
  apiBase,
  titulo,
  accent,
  volverHref = "/",
}: {
  apiBase: string;
  titulo: string;
  accent: Accent;
  volverHref?: string;
}) {
  const [data, setData] = useState<TableroData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState("");
  const [configAbierta, setConfigAbierta] = useState(false);

  const [modalTarjeta, setModalTarjeta] = useState<{
    tarjeta: Tarjeta | null; // null = creando
    columnaId: number;
  } | null>(null);

  // ---------- drag & drop de tarjetas (pointer events, estilo Trello) ----------
  // Mismo mecanismo que SistemaClient: sin drag nativo HTML5, un clon flota en
  // un portal siguiendo el puntero y un bloque gris marca dónde caería. Con
  // criterioOrden POSICION el bloque es posicional; con CREACION/IMPORTANCIA
  // se resalta la columna entera (la posición la decide el criterio, no el mouse).
  type DragData = { id: number; fromColId: number; w: number; h: number; dx: number; dy: number; card: Tarjeta };
  const drag = useRef<DragData | null>(null);
  const pendiente = useRef<{ id: number; colId: number; x: number; y: number; card: Tarjeta; el: HTMLElement } | null>(
    null,
  );
  const [dragActivo, setDragActivo] = useState<DragData | null>(null);
  const [hover, setHover] = useState<{ colId: number; index: number | null } | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const puntero = useRef<{ x: number; y: number } | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const manualPos = data?.config.criterioOrden === "POSICION";
  const manualPosRef = useRef(manualPos);
  manualPosRef.current = manualPos;

  const cargar = async () => {
    try {
      const d = await apiJson(apiBase);
      setData(d);
    } catch {
      setMsg(`No se pudo cargar ${apiBase}.`);
    }
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const moverPunteroRef = useRef<(e: PointerEvent) => void>(() => {});
  const soltarRef = useRef<() => void>(() => {});
  const cancelarRef = useRef<() => void>(() => {});
  const onDragMove = useRef((e: PointerEvent) => moverPunteroRef.current(e)).current;
  const onDragUp = useRef(() => soltarRef.current()).current;
  const onDragCancel = useRef(() => cancelarRef.current()).current;

  const terminarDrag = () => {
    pendiente.current = null;
    drag.current = null;
    setDragActivo(null);
    setHover(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
    window.removeEventListener("pointercancel", onDragCancel);
  };
  cancelarRef.current = terminarDrag;

  moverPunteroRef.current = (e: PointerEvent) => {
    puntero.current = { x: e.clientX, y: e.clientY };
    const p = pendiente.current;
    if (!drag.current && p) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return; // umbral: sigue siendo click
      const r = p.el.getBoundingClientRect();
      drag.current = {
        id: p.id,
        fromColId: p.colId,
        w: r.width,
        h: r.height,
        dx: Math.min(Math.max(p.x - r.left, 8), r.width - 8),
        dy: Math.min(Math.max(p.y - r.top, 8), r.height - 8),
        card: p.card,
      };
      setDragActivo(drag.current);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    }
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    if (overlayRef.current) {
      overlayRef.current.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px) rotate(4deg)`;
    }
    const cols = boardRef.current?.querySelectorAll<HTMLElement>("[data-col-id]");
    let destino: { colId: number; index: number | null } | null = null;
    if (cols)
      for (const el of Array.from(cols)) {
        const r = el.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right) continue;
        const colId = Number(el.dataset.colId);
        if (!manualPosRef.current) {
          destino = { colId, index: null };
        } else {
          const cardEls = Array.from(el.querySelectorAll<HTMLElement>("[data-card-id]"));
          let idx = cardEls.length;
          for (let i = 0; i < cardEls.length; i++) {
            const cr = cardEls[i].getBoundingClientRect();
            if (e.clientY < cr.top + cr.height / 2) {
              idx = i;
              break;
            }
          }
          destino = { colId, index: idx };
        }
        break;
      }
    const prev = hoverRef.current;
    if (prev?.colId !== destino?.colId || prev?.index !== destino?.index) setHover(destino);
  };

  soltarRef.current = () => {
    const d = drag.current;
    const destino = hoverRef.current;
    terminarDrag();
    if (!d || !destino || !dataRef.current) return;

    const copia: TableroData = {
      ...dataRef.current,
      columnas: dataRef.current.columnas.map((c) => ({ ...c, tarjetas: [...c.tarjetas] })),
    };

    let card: Tarjeta | undefined;
    let srcCol: Columna | undefined;
    for (const c of copia.columnas) {
      const idx = c.tarjetas.findIndex((tj) => tj.id === d.id);
      if (idx >= 0) {
        card = c.tarjetas[idx];
        srcCol = c;
        c.tarjetas.splice(idx, 1);
      }
    }
    if (!card || !srcCol) return;

    const destCol = copia.columnas.find((c) => c.id === destino.colId);
    if (!destCol) return;
    if (destino.index === null && destCol.id === srcCol.id) return; // autoordenada, no cambió de columna

    const idx =
      destino.index === null
        ? destCol.tarjetas.length
        : Math.max(0, Math.min(destino.index, destCol.tarjetas.length));
    destCol.tarjetas.splice(idx, 0, {
      ...card,
      columnaId: destCol.id,
      columnaDesde: destCol.id !== srcCol.id ? new Date().toISOString() : card.columnaDesde,
    });

    const cambios: { id: number; columnaId: number; orden: number }[] = [];
    if (manualPosRef.current) {
      srcCol.tarjetas.forEach((tj, i) => cambios.push({ id: tj.id, columnaId: srcCol!.id, orden: i }));
      if (destCol.id !== srcCol.id) {
        destCol.tarjetas.forEach((tj, i) => cambios.push({ id: tj.id, columnaId: destCol!.id, orden: i }));
      }
    } else if (destCol.id !== srcCol.id) {
      // Orden automático (creación/importancia): solo importa a qué columna
      // pertenece la tarjeta, no su posición — un solo cambio alcanza.
      cambios.push({ id: card.id, columnaId: destCol.id, orden: destCol.tarjetas.length });
    }

    setData(copia);
    if (cambios.length) {
      apiJson(`${apiBase}/tarjetas/reorder`, { method: "PATCH", body: JSON.stringify({ cambios }) })
        .then(() => cargar())
        .catch(() => cargar());
    }
  };

  const onCardPointerDown = (e: React.PointerEvent, card: Tarjeta, colId: number) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    pendiente.current = { id: card.id, colId, x: e.clientX, y: e.clientY, card, el: e.currentTarget as HTMLElement };
    window.addEventListener("pointermove", onDragMove, { passive: false });
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragCancel);
  };

  useEffect(() => {
    if (!dragActivo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") terminarDrag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActivo]);

  useEffect(() => {
    if (!dragActivo) return;
    const EDGE = 90;
    const MAX_SPEED = 20;
    let raf: number;
    const tick = () => {
      const el = boardRef.current;
      const p = puntero.current;
      if (el && p) {
        const rect = el.getBoundingClientRect();
        if (p.x < rect.left + EDGE) el.scrollLeft -= MAX_SPEED * ((rect.left + EDGE - p.x) / EDGE);
        else if (p.x > rect.right - EDGE) el.scrollLeft += MAX_SPEED * ((p.x - (rect.right - EDGE)) / EDGE);
        const colId = hoverRef.current?.colId;
        if (colId != null) {
          const lista = el.querySelector<HTMLElement>(`[data-col-id="${colId}"] [data-col-lista]`);
          if (lista) {
            const lr = lista.getBoundingClientRect();
            if (p.y < lr.top + 60) lista.scrollTop -= MAX_SPEED * ((lr.top + 60 - p.y) / 60);
            else if (p.y > lr.bottom - 60) lista.scrollTop += MAX_SPEED * ((p.y - (lr.bottom - 60)) / 60);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragActivo]);

  // ---------- columnas ----------
  const crearColumna = async () => {
    const nombre = window.prompt("Nombre de la nueva columna:");
    if (!nombre || !nombre.trim()) return;
    await apiJson(`${apiBase}/columnas`, { method: "POST", body: JSON.stringify({ nombre: nombre.trim() }) });
    cargar();
  };

  const renombrarColumna = async (col: Columna) => {
    const nombre = window.prompt("Nuevo nombre de columna:", col.nombre);
    if (!nombre || !nombre.trim() || nombre.trim() === col.nombre) return;
    await apiJson(`${apiBase}/columnas/${col.id}`, { method: "PATCH", body: JSON.stringify({ nombre: nombre.trim() }) });
    cargar();
  };

  const borrarColumna = async (col: Columna) => {
    if (!window.confirm(`¿Borrar columna "${col.nombre}"? Las tarjetas se mueven a otra columna.`)) return;
    const r = await fetch(`${apiBase}/columnas/${col.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || "No se pudo borrar la columna.");
    }
    cargar();
  };

  const moverColumna = (colId: number, dir: -1 | 1) => {
    if (!data) return;
    const cols = [...data.columnas].sort((a, b) => a.orden - b.orden);
    const idx = cols.findIndex((c) => c.id === colId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= cols.length) return;
    [cols[idx], cols[j]] = [cols[j], cols[idx]];
    apiJson(`${apiBase}/columnas/reorder`, { method: "PATCH", body: JSON.stringify({ orden: cols.map((c) => c.id) }) })
      .then(() => cargar())
      .catch(() => cargar());
  };

  // ---------- tarjetas ----------
  const borrarTarjeta = async (id: number) => {
    if (!window.confirm("¿Borrar esta tarjeta?")) return;
    await fetch(`${apiBase}/tarjetas/${id}`, { method: "DELETE" });
    setModalTarjeta(null);
    cargar();
  };

  const guardarTarjeta = async (campos: Campos) => {
    if (!modalTarjeta) return;
    if (modalTarjeta.tarjeta) {
      await apiJson(`${apiBase}/tarjetas/${modalTarjeta.tarjeta.id}`, {
        method: "PATCH",
        body: JSON.stringify({ campos }),
      });
    } else {
      await apiJson(`${apiBase}/tarjetas`, {
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

  const guardarConfig = async (criterioOrden: CriterioOrden) => {
    setData((d) => (d ? { ...d, config: { ...d.config, criterioOrden } } : d));
    try {
      await apiJson(`${apiBase}/config`, { method: "PATCH", body: JSON.stringify({ criterioOrden }) });
    } catch {
      cargar();
    }
  };

  if (cargando || !data) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-zinc-400 flex items-center justify-center">Cargando…</div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="sticky top-0 z-20 bg-[#151515] border-b border-zinc-800 px-6 h-14 flex items-center gap-4">
        <Link href={volverHref} className="text-zinc-400 hover:text-white text-sm">
          ← Inicio
        </Link>
        <h1 className={`font-bold text-lg ${accent.text}`}>{titulo}</h1>
        {msg && <span className="text-amber-400 text-sm ml-4">{msg}</span>}
        <UsuarioActual className="ml-auto" />
      </header>

      <main className="px-6 py-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setConfigAbierta((v) => !v)}
              className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 rounded-md px-2 py-1"
            >
              ⚙ Configuración
            </button>
            {configAbierta && (
              <div className="absolute z-10 mt-2 w-64 bg-[#161616] border border-zinc-800 rounded-lg p-2 shadow-xl">
                <p className="text-[11px] text-zinc-500 px-1.5 pb-1.5">Cómo se acomodan las tarjetas:</p>
                {CRITERIOS.map((c) => (
                  <button
                    key={c.v}
                    onClick={() => guardarConfig(c.v)}
                    className={`w-full flex items-center justify-between text-left px-2 py-1.5 rounded-md text-sm mb-0.5 last:mb-0 ${
                      data.config.criterioOrden === c.v
                        ? `bg-white/[0.08] ${accent.text}`
                        : "text-zinc-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span>{c.l}</span>
                    <span className="text-[10px] text-zinc-500">{c.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div ref={boardRef} className="flex items-start gap-3 overflow-x-auto pb-4 scrollbar-hide">
          {data.columnas.map((col) => {
            const ordenadas = ordenarTarjetas(col.tarjetas, data.config.criterioOrden);
            const listaRender = dragActivo ? ordenadas.filter((c) => c.id !== dragActivo.id) : ordenadas;
            const hoverAca = hover?.colId === col.id;
            const hoverAuto = hoverAca && hover?.index === null;
            return (
              <div
                key={col.id}
                data-col-id={col.id}
                className={`group/col w-[272px] shrink-0 flex flex-col max-h-[calc(100vh-225px)] rounded-xl bg-[#16191d] shadow-[0_1px_2px_rgba(0,0,0,0.55)] ${
                  hoverAuto ? `ring-2 ${accent.ring}` : ""
                }`}
              >
                <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                  <button
                    className="text-sm font-semibold text-zinc-200 truncate text-left flex-1"
                    onClick={() => renombrarColumna(col)}
                    title="Click para renombrar"
                  >
                    {col.nombre} <span className="text-zinc-500 font-normal text-xs">{col.tarjetas.length}</span>
                  </button>
                  <div className="flex items-center gap-0.5 text-zinc-500 opacity-0 group-hover/col:opacity-100 transition-opacity">
                    <button onClick={() => moverColumna(col.id, -1)} className="hover:text-zinc-200 px-1" title="Mover izquierda">
                      ◀
                    </button>
                    <button onClick={() => moverColumna(col.id, 1)} className="hover:text-zinc-200 px-1" title="Mover derecha">
                      ▶
                    </button>
                    <button onClick={() => borrarColumna(col)} className="hover:text-red-400 px-1" title="Borrar columna">
                      ✕
                    </button>
                  </div>
                </div>

                <div data-col-lista className="flex-1 min-h-[6px] overflow-y-auto px-2 pb-1 flex flex-col gap-2 scrollbar-hide">
                  {hoverAuto && dragActivo && (
                    <div className="shrink-0 flex flex-col gap-1">
                      <p className="text-center text-[11px] text-zinc-500">columna con orden automático</p>
                      {dragActivo.fromColId !== col.id && (
                        <div className="rounded-lg bg-white/[0.12]" style={{ height: dragActivo.h }} />
                      )}
                    </div>
                  )}
                  {listaRender.map((card, i) => (
                    <Fragment key={card.id}>
                      {hoverAca && dragActivo && hover?.index === i && (
                        <div className="shrink-0 rounded-lg bg-white/[0.12]" style={{ height: dragActivo.h }} />
                      )}
                      <div
                        data-card-id={card.id}
                        onPointerDown={(e) => onCardPointerDown(e, card, col.id)}
                        onClick={() => setModalTarjeta({ tarjeta: card, columnaId: col.id })}
                        className="group cursor-pointer select-none"
                      >
                        <TarjetaVisual card={card} expandir={dragActivo == null} />
                      </div>
                    </Fragment>
                  ))}
                  {hoverAca && dragActivo && hover?.index === listaRender.length && (
                    <div className="shrink-0 rounded-lg bg-white/[0.12]" style={{ height: dragActivo.h }} />
                  )}
                </div>

                <button
                  onClick={() => setModalTarjeta({ tarjeta: null, columnaId: col.id })}
                  className="mx-2 mb-2 mt-1 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200 transition-colors"
                >
                  ＋ Agregar tarjeta
                </button>
              </div>
            );
          })}

          <button
            onClick={crearColumna}
            className="w-[272px] shrink-0 self-start rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-zinc-500 hover:text-zinc-200 text-sm text-left px-4 py-3 transition-colors"
          >
            ＋ Agregar columna
          </button>
        </div>
      </main>

      {modalTarjeta && (
        <ModalTarjeta
          modal={modalTarjeta}
          accent={accent}
          onClose={() => setModalTarjeta(null)}
          onSave={guardarTarjeta}
          onDelete={modalTarjeta.tarjeta ? () => borrarTarjeta(modalTarjeta.tarjeta!.id) : undefined}
        />
      )}

      {dragActivo &&
        createPortal(
          <div
            ref={overlayRef}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: dragActivo.w,
              transform: `translate(${(puntero.current?.x ?? 0) - dragActivo.dx}px, ${
                (puntero.current?.y ?? 0) - dragActivo.dy
              }px) rotate(4deg)`,
              zIndex: 100,
              pointerEvents: "none",
            }}
          >
            <TarjetaVisual card={dragActivo.card} expandir={false} flotante />
          </div>,
          document.body,
        )}
    </div>
  );
}

// Cuerpo visual de una tarjeta (lista y clon flotante del drag).
function TarjetaVisual({ card, expandir, flotante }: { card: Tarjeta; expandir: boolean; flotante?: boolean }) {
  const txt = String(card.campos[SCHEMA_TAREA.titleKey] || "(sin descripción)");
  const [first, ...rest] = txt.split("\n");
  const fecha = parseDate(card.campos.fecha);
  const imp = String(card.campos.importancia ?? "");
  const impColor =
    imp === "Alta" ? "bg-red-500" : imp === "Media" ? "bg-amber-400" : imp === "Baja" ? "bg-emerald-500" : "";
  return (
    <div
      className={`rounded-lg px-3 py-2 ring-1 transition-[background-color,box-shadow] duration-150 bg-[#22272b] group-hover:bg-[#282e33] ${
        flotante ? "ring-white/10 shadow-2xl shadow-black/70 opacity-95" : "ring-white/[0.04] shadow-[0_1px_1px_rgba(0,0,0,0.45)] group-hover:ring-zinc-500/70"
      }`}
    >
      {impColor && <span title={`Importancia ${imp}`} className={`block h-1.5 w-10 rounded-full mb-1.5 ${impColor}`} />}
      <p className="text-sm text-zinc-100 leading-snug whitespace-pre-line break-words">{first}</p>
      {rest.length > 0 && (
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            expandir ? "grid-rows-[0fr] group-hover:grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <p className="overflow-hidden text-sm text-zinc-400 whitespace-pre-line break-words">{rest.join("\n")}</p>
        </div>
      )}
      {(fecha || card.campos.responsable) && (
        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          {fecha && (
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-400">
              🕒 {fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
            </span>
          )}
          {card.campos.responsable && (
            <span className="max-w-full truncate rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-400">
              {card.campos.responsable}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ModalTarjeta({
  modal,
  accent,
  onClose,
  onSave,
  onDelete,
}: {
  modal: { tarjeta: Tarjeta | null; columnaId: number };
  accent: Accent;
  onClose: () => void;
  onSave: (campos: Campos) => void;
  onDelete?: () => void;
}) {
  const [campos, setCampos] = useState<Campos>(modal.tarjeta?.campos ?? {});
  const primerCampo = SCHEMA_TAREA.fields.find((f) => !f.auto)?.k;

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
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#161616] border border-zinc-800 rounded-xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-4 text-zinc-100">{modal.tarjeta ? "Editar tarjeta" : "Nueva tarjeta"}</h2>

        {modal.tarjeta && (
          <p className="text-xs text-zinc-500 mb-3">
            Alta: {campos.fecha ? new Date(campos.fecha as string).toLocaleString() : "—"}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {SCHEMA_TAREA.fields.map((f) => {
            if (f.auto) return null;
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
                  <select
                    value={campos[f.k] ?? ""}
                    onChange={(e) => setCampos((c) => ({ ...c, [f.k]: e.target.value || null }))}
                    className="w-full bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="">—</option>
                    {(f.opciones ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => onSave(campos)} className={accent.text}>
              Guardar
            </Button>
          </div>
        </div>
        <p className="hidden sm:block text-[11px] text-zinc-500 text-right mt-2">Esc cancela · Ctrl+Enter guarda</p>
      </div>
    </div>
  );
}
