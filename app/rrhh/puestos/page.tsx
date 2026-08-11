"use client";

// /rrhh/puestos — ABM de puestos + procedimientos/instructivos.
// Cada documento se asigna a uno o más puestos; al guardar se indexa en Qdrant
// (vía vicki_chat) para que Vicki responda "¿cuál es el procedimiento para X?".
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, Briefcase, Check, Download, FileText, Loader2, Paperclip,
  Pencil, Plus, RefreshCw, Trash2, X,
} from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";

type Area = { id: number; nombre: string; sectores: { id: number; nombre: string }[] };
type Puesto = {
  id: number; nombre: string; descripcion: string | null; sectorId: number | null;
  activo: boolean;
  sector: { id: number; nombre: string; area: { id: number; nombre: string } } | null;
  documentos: { documentoId: number }[];
};
type Documento = {
  id: number; tipo: string; titulo: string; contenido: string;
  archivoNombre: string | null; version: number; vigente: boolean;
  puestos: { puestoId: number; puesto: { nombre: string } }[];
};

const TIPO_LABEL: Record<string, string> = { procedimiento: "Procedimiento", instructivo: "Instructivo" };

export default function PuestosPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [sel, setSel] = useState<number | null>(null); // puesto seleccionado (null = todos)
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  // ── modales ──
  const [editPuesto, setEditPuesto] = useState<Partial<Puesto> | null>(null);
  const [editDoc, setEditDoc] = useState<(Partial<Documento> & { puestoIds?: number[]; file?: File | null }) | null>(null);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p, d] = await Promise.all([
        fetch("/api/rrhh/areas").then((r) => r.json()),
        fetch("/api/rrhh/puestos").then((r) => r.json()),
        fetch("/api/rrhh/documentos").then((r) => r.json()),
      ]);
      setAreas(Array.isArray(a) ? a : []);
      setPuestos(Array.isArray(p) ? p : []);
      setDocs(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const avisar = (msg: string) => { setAviso(msg); setTimeout(() => setAviso(null), 5000); };
  const chequearRag = (r: { ragOk?: boolean; ragError?: string }) => {
    if (r?.ragOk === false) avisar(`⚠️ Guardado en la base, pero no se pudo indexar en Vicki: ${r.ragError ?? ""}. Volvé a guardar para reintentar.`);
  };

  const docsVisibles = useMemo(
    () => (sel == null ? docs : docs.filter((d) => d.puestos.some((p) => p.puestoId === sel))),
    [docs, sel],
  );

  // ── acciones puesto ──
  async function guardarPuesto() {
    if (!editPuesto?.nombre?.trim()) return;
    setSaving(true);
    try {
      const body = { nombre: editPuesto.nombre.trim(), descripcion: editPuesto.descripcion ?? null, sectorId: editPuesto.sectorId ?? null };
      const r = editPuesto.id
        ? await fetch(`/api/rrhh/puestos/${editPuesto.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/rrhh/puestos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { avisar(`❌ ${j.error ?? r.status}`); return; }
      chequearRag(j);
      setEditPuesto(null);
      cargar();
    } finally { setSaving(false); }
  }

  async function borrarPuesto(p: Puesto) {
    if (!confirm(`¿Borrar el puesto "${p.nombre}"? Los documentos no se borran, solo la asignación.`)) return;
    const r = await fetch(`/api/rrhh/puestos/${p.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) { avisar(`❌ ${j.error ?? r.status}`); return; }
    chequearRag(j);
    if (sel === p.id) setSel(null);
    cargar();
  }

  // ── acciones documento ──
  function nuevoDoc() {
    setEditDoc({ tipo: "procedimiento", titulo: "", contenido: "", puestoIds: sel != null ? [sel] : [], file: null });
  }
  function abrirDoc(d: Documento) {
    setEditDoc({ ...d, puestoIds: d.puestos.map((p) => p.puestoId), file: null });
  }

  async function guardarDoc() {
    if (!editDoc?.titulo?.trim() || !editDoc?.contenido?.trim()) { avisar("❌ Falta título o contenido"); return; }
    setSaving(true);
    try {
      const body = {
        tipo: editDoc.tipo ?? "procedimiento",
        titulo: editDoc.titulo.trim(),
        contenido: editDoc.contenido,
        vigente: editDoc.vigente ?? true,
        puestoIds: editDoc.puestoIds ?? [],
      };
      const r = editDoc.id
        ? await fetch(`/api/rrhh/documentos/${editDoc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/rrhh/documentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { avisar(`❌ ${j.error ?? r.status}`); return; }
      // adjunto opcional
      if (editDoc.file) {
        const fd = new FormData();
        fd.append("file", editDoc.file);
        const ra = await fetch(`/api/rrhh/documentos/${j.id ?? editDoc.id}/archivo`, { method: "POST", body: fd });
        if (!ra.ok) avisar("⚠️ Documento guardado pero falló la subida del adjunto.");
      }
      chequearRag(j);
      setEditDoc(null);
      cargar();
    } finally { setSaving(false); }
  }

  async function borrarDoc(d: Documento) {
    if (!confirm(`¿Borrar "${d.titulo}"? Se elimina también del índice de Vicki.`)) return;
    const r = await fetch(`/api/rrhh/documentos/${d.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) { avisar(`❌ ${j.error ?? r.status}`); return; }
    chequearRag(j);
    cargar();
  }

  const inputCls = "w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-yellow-400 transition-colors";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* header */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-3 flex items-center gap-3">
        <InicioButton />
        <Briefcase size={18} className="text-yellow-400" />
        <h1 className="text-sm font-semibold uppercase tracking-wider">Puestos · Procedimientos e instructivos</h1>
        <button onClick={cargar} className="ml-auto text-zinc-400 hover:text-yellow-400 p-2" title="Refrescar">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {aviso && (
        <div className="mx-4 mt-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-200">{aviso}</div>
      )}

      <div className="p-4 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* ── columna puestos ── */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Puestos</span>
            <button onClick={() => setEditPuesto({})} className="inline-flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300">
              <Plus size={14} /> Nuevo
            </button>
          </div>
          <button
            onClick={() => setSel(null)}
            className={`w-full text-left px-4 py-2.5 text-sm border-b border-zinc-800/50 hover:bg-zinc-900 ${sel == null ? "bg-zinc-900 text-yellow-400" : "text-zinc-300"}`}
          >
            Todos los documentos <span className="text-zinc-600">({docs.length})</span>
          </button>
          {puestos.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-900 cursor-pointer ${sel === p.id ? "bg-zinc-900" : ""}`}
              onClick={() => setSel(p.id)}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-sm truncate ${sel === p.id ? "text-yellow-400" : "text-zinc-200"} ${!p.activo ? "line-through opacity-50" : ""}`}>{p.nombre}</div>
                <div className="text-[11px] text-zinc-600 truncate">
                  {p.sector ? `${p.sector.area.nombre} › ${p.sector.nombre}` : "Sin sector"} · {p.documentos.length} doc.
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setEditPuesto(p); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-yellow-400 p-1" title="Editar"><Pencil size={13} /></button>
              <button onClick={(e) => { e.stopPropagation(); borrarPuesto(p); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-1" title="Borrar"><Trash2 size={13} /></button>
            </div>
          ))}
          {!loading && puestos.length === 0 && <div className="px-4 py-6 text-sm text-zinc-600">Sin puestos. Creá el primero con «Nuevo».</div>}
        </div>

        {/* ── columna documentos ── */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {sel == null ? "Todos los documentos" : `Documentos de «${puestos.find((p) => p.id === sel)?.nombre ?? ""}»`}
            </span>
            <button onClick={nuevoDoc} className="inline-flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300">
              <Plus size={14} /> Nuevo documento
            </button>
          </div>
          {docsVisibles.map((d) => (
            <div key={d.id} className="group flex items-start gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-900">
              {d.tipo === "procedimiento"
                ? <BookOpen size={16} className="mt-0.5 text-yellow-400 shrink-0" />
                : <FileText size={16} className="mt-0.5 text-sky-400 shrink-0" />}
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => abrirDoc(d)}>
                <div className={`text-sm ${d.vigente ? "text-zinc-200" : "text-zinc-500 line-through"}`}>
                  {d.titulo} <span className="text-[11px] text-zinc-600">v{d.version}</span>
                  {!d.vigente && <span className="ml-2 text-[10px] uppercase text-red-400/80">no vigente</span>}
                </div>
                <div className="text-[11px] text-zinc-600 truncate">
                  {TIPO_LABEL[d.tipo] ?? d.tipo} · {d.puestos.length ? d.puestos.map((p) => p.puesto.nombre).join(", ") : "sin puesto asignado"}
                </div>
              </div>
              {d.archivoNombre && (
                <a href={`/api/rrhh/documentos/${d.id}/archivo`} className="text-zinc-500 hover:text-yellow-400 p-1" title={`Descargar ${d.archivoNombre}`} onClick={(e) => e.stopPropagation()}>
                  <Download size={14} />
                </a>
              )}
              <button onClick={() => borrarDoc(d)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-1" title="Borrar"><Trash2 size={14} /></button>
            </div>
          ))}
          {!loading && docsVisibles.length === 0 && (
            <div className="px-4 py-6 text-sm text-zinc-600">Sin documentos{sel != null ? " asignados a este puesto" : ""}.</div>
          )}
        </div>
      </div>

      {/* ── modal puesto ── */}
      {editPuesto && (
        <Modal titulo={editPuesto.id ? "Editar puesto" : "Nuevo puesto"} onClose={() => setEditPuesto(null)}>
          <label className="block text-xs text-zinc-500 mb-1">Nombre *</label>
          <input className={inputCls} value={editPuesto.nombre ?? ""} onChange={(e) => setEditPuesto({ ...editPuesto, nombre: e.target.value })} autoFocus />
          <label className="block text-xs text-zinc-500 mb-1 mt-3">Sector</label>
          <select className={inputCls} value={editPuesto.sectorId ?? ""} onChange={(e) => setEditPuesto({ ...editPuesto, sectorId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sin sector</option>
            {areas.map((a) => (
              <optgroup key={a.id} label={a.nombre}>
                {a.sectores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </optgroup>
            ))}
          </select>
          <label className="block text-xs text-zinc-500 mb-1 mt-3">Descripción</label>
          <textarea className={`${inputCls} min-h-[70px]`} value={editPuesto.descripcion ?? ""} onChange={(e) => setEditPuesto({ ...editPuesto, descripcion: e.target.value })} />
          {editPuesto.id && (
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={editPuesto.activo ?? true} onChange={(e) => setEditPuesto({ ...editPuesto, activo: e.target.checked })} className="accent-yellow-400" />
              Activo
            </label>
          )}
          <PieModal saving={saving} onSave={guardarPuesto} onClose={() => setEditPuesto(null)} />
        </Modal>
      )}

      {/* ── modal documento ── */}
      {editDoc && (
        <Modal titulo={editDoc.id ? `Editar documento (v${editDoc.version})` : "Nuevo documento"} onClose={() => setEditDoc(null)} ancho="max-w-3xl">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
              <select className={inputCls} value={editDoc.tipo ?? "procedimiento"} onChange={(e) => setEditDoc({ ...editDoc, tipo: e.target.value })}>
                <option value="procedimiento">Procedimiento</option>
                <option value="instructivo">Instructivo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Título *</label>
              <input className={inputCls} value={editDoc.titulo ?? ""} onChange={(e) => setEditDoc({ ...editDoc, titulo: e.target.value })} autoFocus />
            </div>
          </div>

          <label className="block text-xs text-zinc-500 mb-1 mt-3">Contenido * <span className="text-zinc-600">(este texto es lo que Vicki busca — pegá acá el procedimiento completo)</span></label>
          <textarea className={`${inputCls} min-h-[220px] font-mono text-[13px]`} value={editDoc.contenido ?? ""} onChange={(e) => setEditDoc({ ...editDoc, contenido: e.target.value })} />

          <label className="block text-xs text-zinc-500 mb-1 mt-3">Puestos asignados</label>
          <div className="flex flex-wrap gap-1.5">
            {puestos.map((p) => {
              const on = (editDoc.puestoIds ?? []).includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setEditDoc({ ...editDoc, puestoIds: on ? (editDoc.puestoIds ?? []).filter((x) => x !== p.id) : [...(editDoc.puestoIds ?? []), p.id] })}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-yellow-400/60 bg-yellow-400/10 text-yellow-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}
                >
                  {on && <Check size={11} />}{p.nombre}
                </button>
              );
            })}
            {puestos.length === 0 && <span className="text-xs text-zinc-600">Creá puestos primero para poder asignar.</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-400 cursor-pointer hover:text-zinc-200">
              <Paperclip size={14} />
              {editDoc.file ? editDoc.file.name : (editDoc.archivoNombre ? `Adjunto: ${editDoc.archivoNombre} (reemplazar…)` : "Adjuntar original (PDF/Word, opcional)")}
              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.png,.jpg,.jpeg" onChange={(e) => setEditDoc({ ...editDoc, file: e.target.files?.[0] ?? null })} />
            </label>
            {editDoc.id && (
              <label className="inline-flex items-center gap-2 text-sm text-zinc-300 ml-auto">
                <input type="checkbox" checked={editDoc.vigente ?? true} onChange={(e) => setEditDoc({ ...editDoc, vigente: e.target.checked })} className="accent-yellow-400" />
                Vigente (si lo desmarcás, Vicki deja de usarlo)
              </label>
            )}
          </div>

          <PieModal saving={saving} onSave={guardarDoc} onClose={() => setEditDoc(null)} />
        </Modal>
      )}
    </div>
  );
}

function Modal({ titulo, onClose, children, ancho = "max-w-md" }: { titulo: string; onClose: () => void; children?: React.ReactNode; ancho?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <div className={`w-full ${ancho} rounded-xl border border-zinc-700 bg-zinc-900 p-5 mt-10 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">{titulo}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PieModal({ saving, onSave, onClose }: { saving: boolean; onSave: () => void; onClose: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancelar</button>
      <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-yellow-300 disabled:opacity-50">
        {saving && <Loader2 size={14} className="animate-spin" />} Guardar
      </button>
    </div>
  );
}
