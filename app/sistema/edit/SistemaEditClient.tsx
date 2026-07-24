"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { InicioButton } from "@/components/ui/InicioButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  apiJson,
  Combobox,
  parseDate,
  schemaFor,
  type Campos,
  type CampoDef,
  type Columna,
  type Tablero,
  type Tarjeta,
} from "../SistemaClient";

function truncar(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function formatCampo(f: CampoDef, v: string | null) {
  if (!v) return "—";
  if (f.t === "date") {
    const d = parseDate(v);
    return d
      ? d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
      : truncar(v, 40);
  }
  return truncar(v, f.t === "textarea" ? 90 : 40);
}

// yyyy-mm-dd en horario LOCAL (no UTC), para <input type="date">.
function toDateInputValue(v: string | null | undefined) {
  const d = parseDate(v);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// yyyy-mm-dd (del input) -> ISO string, fijando mediodía local para no correrse de día por huso horario.
function fromDateInputValue(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

export default function SistemaEditClient() {
  const [tableros, setTableros] = useState<Tablero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<string>("sistema");
  const [msg, setMsg] = useState("");
  const [openCols, setOpenCols] = useState<Set<number>>(new Set());

  const [modalTarjeta, setModalTarjeta] = useState<{
    tarjeta: Tarjeta | null; // null = creando
    columnaId: number;
    clave: string;
    tableroId: number;
  } | null>(null);

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

  // asegura que las columnas nuevas (o al cambiar de tablero) empiecen abiertas
  useEffect(() => {
    if (!tablero) return;
    setOpenCols((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const c of tablero.columnas) {
        if (!next.has(c.id)) {
          next.add(c.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tablero]);

  useEffect(() => {
    if (!cargando && !tablero && tableros.length > 0) setTab(tableros[0].clave);
  }, [cargando, tablero, tableros]);

  const toggleCol = (id: number) => {
    setOpenCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const borrarTarjeta = async (id: number) => {
    if (!window.confirm("¿Borrar esta tarjeta?")) return;
    await fetch(`/api/sistema/tarjetas/${id}`, { method: "DELETE" });
    setModalTarjeta(null);
    cargar();
  };

  // A diferencia del tablero Trello, acá se guarda EXACTAMENTE lo que se edita:
  // la fecha no se pisa sola con la fecha de hoy. Es la vista pensada para corregir
  // fechas de tarjetas inyectadas con fecha incorrecta.
  const guardarTarjeta = async (campos: Campos) => {
    if (!modalTarjeta) return;
    const payload = { ...campos };
    if (modalTarjeta.tarjeta) {
      await apiJson(`/api/sistema/tarjetas/${modalTarjeta.tarjeta.id}`, {
        method: "PATCH",
        body: JSON.stringify({ campos: payload }),
      });
    } else {
      if (!payload.fecha) payload.fecha = new Date().toISOString();
      await apiJson("/api/sistema/tarjetas", {
        method: "POST",
        body: JSON.stringify({
          columnaId: modalTarjeta.columnaId,
          tableroId: modalTarjeta.tableroId,
          campos: payload,
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
        <InicioButton label="Inicio" iconSize={14} className="text-zinc-400 hover:text-white text-sm" />
        <Link href="/sistema" className="text-zinc-400 hover:text-white text-sm">
          ← Tablero
        </Link>
        <h1 className="font-bold text-rose-500 text-lg">Sistema — Vista tabla</h1>
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
      </nav>

      <main className="px-6 py-6 flex flex-col gap-3">
        {tablero &&
          tablero.columnas.map((col) => {
            const abierta = openCols.has(col.id);
            return (
              <div key={col.id} className="bg-[#161616] border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleCol(col.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1c1c1c]"
                >
                  <span className="text-sm font-semibold text-zinc-100">
                    {col.nombre}{" "}
                    <span className="text-zinc-500 font-normal">({col.tarjetas.length})</span>
                  </span>
                  <span className="text-zinc-500 text-xs">{abierta ? "▾ cerrar" : "▸ abrir"}</span>
                </button>

                {abierta && (
                  <TablaColumna
                    tablero={tablero}
                    col={col}
                    onEditar={(card) =>
                      setModalTarjeta({
                        tarjeta: card,
                        columnaId: col.id,
                        clave: tablero.clave,
                        tableroId: tablero.id,
                      })
                    }
                    onNueva={() =>
                      setModalTarjeta({
                        tarjeta: null,
                        columnaId: col.id,
                        clave: tablero.clave,
                        tableroId: tablero.id,
                      })
                    }
                  />
                )}
              </div>
            );
          })}
      </main>

      {modalTarjeta && (
        <ModalTarjetaFull
          modal={modalTarjeta}
          onClose={() => setModalTarjeta(null)}
          onSave={guardarTarjeta}
          onDelete={modalTarjeta.tarjeta ? () => borrarTarjeta(modalTarjeta.tarjeta!.id) : undefined}
        />
      )}
    </div>
  );
}

function TablaColumna({
  tablero,
  col,
  onEditar,
  onNueva,
}: {
  tablero: Tablero;
  col: Columna;
  onEditar: (t: Tarjeta) => void;
  onNueva: () => void;
}) {
  const schema = schemaFor(tablero.clave);
  return (
    <div className="border-t border-zinc-800">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
              {schema.fields.map((f) => (
                <th key={f.k} className="text-left font-medium px-3 py-2 whitespace-nowrap">
                  {f.l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {col.tarjetas.map((card) => {
              const sinUbicacion = tablero.clave === "sistema" && !card.campos.ubicacion;
              const sinCategoria = tablero.clave === "sistema" && !card.campos.categoria;
              return (
                <tr
                  key={card.id}
                  onClick={() => onEditar(card)}
                  className={`border-b border-zinc-900 last:border-b-0 cursor-pointer hover:bg-[#1f1f1f] transition-colors ${
                    sinUbicacion ? "bg-rose-950/20" : sinCategoria ? "bg-amber-950/20" : ""
                  }`}
                >
                  {schema.fields.map((f) => (
                    <td key={f.k} className="px-3 py-2 text-zinc-200 align-top">
                      {formatCampo(f, card.campos[f.k])}
                    </td>
                  ))}
                </tr>
              );
            })}
            {col.tarjetas.length === 0 && (
              <tr>
                <td colSpan={schema.fields.length} className="px-3 py-4 text-zinc-600 text-xs">
                  Sin tarjetas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        onClick={onNueva}
        className="text-xs text-zinc-500 hover:text-zinc-200 px-3 py-2 text-left border-t border-zinc-800 w-full"
      >
        ＋ Agregar tarjeta
      </button>
    </div>
  );
}

function ModalTarjetaFull({
  modal,
  onClose,
  onSave,
  onDelete,
}: {
  modal: { tarjeta: Tarjeta | null; columnaId: number; clave: string; tableroId: number };
  onClose: () => void;
  onSave: (campos: Campos) => void;
  onDelete?: () => void;
}) {
  const schema = schemaFor(modal.clave);
  const [campos, setCampos] = useState<Campos>(modal.tarjeta?.campos ?? {});
  const [opcionesExtra, setOpcionesExtra] = useState<Record<string, string[]>>({});

  useEffect(() => {
    apiJson(`/api/sistema/opciones?clave=${encodeURIComponent(modal.clave)}`)
      .then(setOpcionesExtra)
      .catch(() => {});
  }, [modal.clave]);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#161616] border border-zinc-800 rounded-xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-4 text-zinc-100">
          {modal.tarjeta ? "Editar tarjeta" : "Nueva tarjeta"}
        </h2>

        <div className="flex flex-col gap-3">
          {schema.fields.map((f) => {
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
                    return f.extensible ? arr.sort((a, b) => a.localeCompare(b, "es")) : arr;
                  })()
                : [];
            return (
              <div key={f.k}>
                <label className="text-xs text-zinc-500 mb-1 block">{f.l}</label>
                {f.t === "date" ? (
                  <Input
                    type="date"
                    value={toDateInputValue(campos[f.k])}
                    onChange={(e) =>
                      setCampos((c) => ({
                        ...c,
                        [f.k]: e.target.value ? fromDateInputValue(e.target.value) : null,
                      }))
                    }
                  />
                ) : f.t === "textarea" ? (
                  <Textarea
                    value={campos[f.k] ?? ""}
                    onChange={(e) => setCampos((c) => ({ ...c, [f.k]: e.target.value }))}
                  />
                ) : f.t === "select" ? (
                  <div className="flex gap-2">
                    <Combobox
                      value={String(campos[f.k] ?? "")}
                      options={combinedOptions}
                      placeholder="Escribí para buscar o crear…"
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
