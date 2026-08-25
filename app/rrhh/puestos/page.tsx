"use client";

// /rrhh/puestos — ABM de puestos + documentos por puesto.
// Tres tipos de documento:
//  - procedimiento / instructivo: N por puesto. Vicki los usa cuando preguntan
//    "¿cuál es el procedimiento para X?" (intent=procedimiento).
//  - descripcion_puesto: UNA sola por puesto (la API devuelve 409 si ya hay
//    otra). Es el perfil del puesto y Vicki la usa cuando se BUSCA a alguien
//    para ese puesto (intent=search/ranking) — ver vicki_chat/app/nodes.py.
// Todo se indexa en Qdrant al guardar (vía vicki_chat).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, Briefcase, Check, ClipboardList, Download, FileText, Loader2,
  Paperclip, Pencil, Plus, RefreshCw, Trash2, X,
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

const TIPO_DESCRIPCION = "descripcion_puesto";
const TIPO_LABEL: Record<string, string> = {
  procedimiento: "Procedimiento",
  instructivo: "Instructivo",
  descripcion_puesto: "Descripción de puesto",
};

// Estructura sugerida para una descripción de puesto. El orden importa: lo que
// más pesa para el matching de candidatos va arriba, porque rag_ingest.py corta
// en chunks de ~1200 chars y Vicki recupera solo los mejores.
// IMPORTANTE: dejar una línea en blanco entre secciones — el chunking corta por
// "\n\n"; sin eso una sección entera queda como un párrafo gigante y se parte
// a la mitad de una frase.
const PLANTILLA_DESCRIPCION = `Puesto: 
Área / Sector: 
Reporta a: 
Estado de la búsqueda: abierta
Modalidad: presencial — San Francisco, Córdoba
Tipo de contratación: 
Banda salarial / pretensión: 

REQUISITOS EXCLUYENTES
- 
- 

REQUISITOS DESEABLES
- 
- 

HERRAMIENTAS Y TECNOLOGÍAS
(nombres concretos, como aparecerían en un CV: Excel, Power BI, HubSpot, Meta Ads…)
- 

MISIÓN DEL PUESTO
(2 o 3 renglones)

RESPONSABILIDADES PRINCIPALES
- 
- 

COMPETENCIAS
- 
- `;

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
    // fetches independientes: si una falla (ej. 500 en /documentos), las otras
    // igual actualizan su estado en vez de quedar todas en blanco por un Promise.all.
    const traer = async (url: string, label: string) => {
      try {
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        return Array.isArray(j) ? j : [];
      } catch (e) {
        avisar(`❌ No se pudo cargar ${label}: ${e instanceof Error ? e.message : String(e)}`);
        return [];
      }
    };
    try {
      const [a, p, d] = await Promise.all([
        traer("/api/rrhh/areas", "áreas/sectores"),
        traer("/api/rrhh/puestos", "puestos"),
        traer("/api/rrhh/documentos", "documentos"),
      ]);
      setAreas(a);
      setPuestos(p);
      setDocs(d);
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

  // puestos que ya tienen su descripción de puesto cargada y vigente
  const conDescripcion = useMemo(() => {
    const s = new Set<number>();
    for (const d of docs) {
      if (d.tipo === TIPO_DESCRIPCION && d.vigente) d.puestos.forEach((p) => s.add(p.puestoId));
    }
    return s;
  }, [docs]);

  // ── acciones puesto ──
  async function guardarPuesto() {
    if (!editPuesto?.nombre?.trim()) return;
    if (!editPuesto?.sectorId) { avisar("❌ Elegí un sector"); return; }
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
  // Atajo desde la columna de puestos: crea la descripción de ESE puesto, con
  // el título ya igual al nombre del puesto (el título va dentro del texto que
  // se embebe — ver rag_ingest.py — así que que coincida mejora el recall).
  function nuevaDescripcion(p: Puesto) {
    setEditDoc({
      tipo: TIPO_DESCRIPCION,
      titulo: p.nombre,
      contenido: PLANTILLA_DESCRIPCION.replace("Puesto: ", `Puesto: ${p.nombre}`),
      puestoIds: [p.id],
      file: null,
    });
  }
  function abrirDoc(d: Documento) {
    setEditDoc({ ...d, puestoIds: d.puestos.map((p) => p.puestoId), file: null });
  }

  async function guardarDoc() {
    if (!editDoc?.titulo?.trim() || !editDoc?.contenido?.trim()) { avisar("❌ Falta título o contenido"); return; }
    if (editDoc.tipo === TIPO_DESCRIPCION && (editDoc.puestoIds ?? []).length !== 1) {
      avisar("❌ Una descripción de puesto va asignada a exactamente un puesto.");
      return;
    }
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
        if (!ra.ok) {
          const ja = await ra.json().catch(() => null);
          avisar(`⚠️ Documento guardado pero falló la subida del adjunto${ja?.error ? `: ${ja.error}` : "."}`);
        }
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
        <h1 className="text-sm font-semibold uppercase tracking-wider">Puestos · Descripciones, procedimientos e instructivos</h1>
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
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Puestos <span className="text-zinc-600 normal-case tracking-normal">({puestos.length})</span>
            </span>
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
                <div className="text-[11px] truncate">
                  <span className="text-zinc-600">
                    {p.sector ? `${p.sector.area.nombre} › ${p.sector.nombre}` : "Sin sector"} · {p.documentos.length} doc.
                  </span>
                  {conDescripcion.has(p.id)
                    ? <span className="ml-1 text-emerald-500/80">· con descripción</span>
                    : <span className="ml-1 text-amber-500/80">· sin descripción</span>}
                </div>
              </div>
              {!conDescripcion.has(p.id) && (
                <button onClick={(e) => { e.stopPropagation(); nuevaDescripcion(p); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-emerald-400 p-1" title="Cargar la descripción de este puesto"><ClipboardList size={13} /></button>
              )}
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
              {d.tipo === TIPO_DESCRIPCION
                ? <ClipboardList size={16} className="mt-0.5 text-emerald-400 shrink-0" />
                : d.tipo === "procedimiento"
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
          <label className="block text-xs text-zinc-500 mb-1 mt-3">Sector *</label>
          <select className={inputCls} value={editPuesto.sectorId ?? ""} onChange={(e) => setEditPuesto({ ...editPuesto, sectorId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Elegí un sector…</option>
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
              <select
                className={inputCls}
                value={editDoc.tipo ?? "procedimiento"}
                onChange={(e) => {
                  const tipo = e.target.value;
                  // la descripción va a UN solo puesto: si venían varios, queda el primero
                  const ids = editDoc.puestoIds ?? [];
                  setEditDoc({
                    ...editDoc,
                    tipo,
                    puestoIds: tipo === TIPO_DESCRIPCION ? ids.slice(0, 1) : ids,
                  });
                }}
              >
                <option value="procedimiento">Procedimiento</option>
                <option value="instructivo">Instructivo</option>
                <option value={TIPO_DESCRIPCION}>Descripción de puesto</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Título *</label>
              <input className={inputCls} value={editDoc.titulo ?? ""} onChange={(e) => setEditDoc({ ...editDoc, titulo: e.target.value })} autoFocus />
              {/* el título se embebe junto al texto (rag_ingest.py): que sea igual
                  al nombre del puesto es lo que hace que "buscá alguien para X"
                  recupere esta descripción. */}
              {editDoc.tipo === TIPO_DESCRIPCION && (editDoc.puestoIds ?? []).length === 1 && (() => {
                const nom = puestos.find((p) => p.id === (editDoc.puestoIds ?? [])[0])?.nombre;
                if (!nom || nom === editDoc.titulo) return null;
                return (
                  <button onClick={() => setEditDoc({ ...editDoc, titulo: nom })} className="mt-1 text-[11px] text-amber-400/90 hover:text-amber-300">
                    ⚠️ El título no coincide con el puesto — usar «{nom}»
                  </button>
                );
              })()}
            </div>
          </div>

          <div className="flex items-end justify-between mt-3 mb-1 gap-3">
            <label className="block text-xs text-zinc-500">
              Contenido *{" "}
              <span className="text-zinc-600">
                {editDoc.tipo === TIPO_DESCRIPCION
                  ? "(este texto es lo que Vicki lee al buscar candidatos — el adjunto NO se indexa, pegá el texto acá. Dejá una línea en blanco entre secciones.)"
                  : "(este texto es lo que Vicki busca — pegá acá el procedimiento completo)"}
              </span>
            </label>
            {editDoc.tipo === TIPO_DESCRIPCION && (
              <button
                onClick={() => {
                  if (editDoc.contenido?.trim() && !confirm("Se reemplaza el contenido actual por la plantilla. ¿Seguir?")) return;
                  const nom = puestos.find((p) => p.id === (editDoc.puestoIds ?? [])[0])?.nombre ?? "";
                  setEditDoc({ ...editDoc, contenido: PLANTILLA_DESCRIPCION.replace("Puesto: ", `Puesto: ${nom}`) });
                }}
                className="shrink-0 text-[11px] text-yellow-400 hover:text-yellow-300"
              >
                Usar plantilla
              </button>
            )}
          </div>
          <textarea className={`${inputCls} min-h-[220px] font-mono text-[13px]`} value={editDoc.contenido ?? ""} onChange={(e) => setEditDoc({ ...editDoc, contenido: e.target.value })} />

          <label className="block text-xs text-zinc-500 mb-1 mt-3">
            {editDoc.tipo === TIPO_DESCRIPCION ? "Puesto * (uno solo)" : "Puestos asignados"}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {puestos.map((p) => {
              const ids = editDoc.puestoIds ?? [];
              const on = ids.includes(p.id);
              const esDesc = editDoc.tipo === TIPO_DESCRIPCION;
              // un puesto que ya tiene descripción no se puede elegir para otra
              // (la API devuelve 409 igual — esto solo evita el viaje).
              const ocupado = esDesc && !on && conDescripcion.has(p.id) &&
                !docs.find((d) => d.id === editDoc.id)?.puestos.some((x) => x.puestoId === p.id);
              return (
                <button
                  key={p.id}
                  disabled={ocupado}
                  title={ocupado ? "Este puesto ya tiene una descripción cargada" : undefined}
                  onClick={() => setEditDoc({
                    ...editDoc,
                    puestoIds: esDesc
                      ? (on ? [] : [p.id])                                  // radio
                      : (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]), // checkbox
                  })}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    on
                      ? "border-yellow-400/60 bg-yellow-400/10 text-yellow-300"
                      : ocupado
                        ? "border-zinc-800 text-zinc-700 cursor-not-allowed"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
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
