"use client";

// /rrhh/puestos — ABM de puestos + documentos por puesto.
//
// FLUJO DE CARGA (cambiado 2026-08-25): primero se elige el PUESTO en la
// columna izquierda y recién ahí se habilita "Subir archivos". No hay más
// editor de texto ni selector de puesto dentro del documento: se sube el
// archivo y queda asignado al puesto seleccionado, con el título = nombre del
// archivo sin la extensión. El texto que Vicki indexa se extrae del archivo en
// el servidor (lib/rrhh/extraerTexto.ts) — antes había que pegarlo a mano.
// Los documentos ya cargados son de solo lectura: se ven, se descargan, se
// puede reemplazar el archivo (re-indexa) o borrarlos.
//
// Tres tipos de documento:
//  - procedimiento / instructivo: N por puesto. Vicki los usa cuando preguntan
//    "¿cuál es el procedimiento para X?" (intent=procedimiento).
//  - descripcion_puesto: UNA sola por puesto (la API devuelve 409 si ya hay
//    otra). Es el perfil del puesto y Vicki la usa cuando se BUSCA a alguien
//    para ese puesto (intent=search/ranking) — ver vicki_chat/app/nodes.py.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Briefcase, ClipboardList, Download, FileText, Loader2,
  Pencil, Plus, RefreshCw, Trash2, Upload, X,
} from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";
import { ACCEPT, EXT_SOPORTADAS } from "@/lib/rrhh/documentosFormatos";

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

export default function PuestosPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [sel, setSel] = useState<number | null>(null); // puesto seleccionado (null = todos)
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  // ── carga de archivos ──
  const [tipoSubida, setTipoSubida] = useState("procedimiento");
  const [subiendo, setSubiendo] = useState<{ hechos: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reemplazoRef = useRef<HTMLInputElement>(null);

  // ── modales ──
  const [editPuesto, setEditPuesto] = useState<Partial<Puesto> | null>(null);
  const [verDoc, setVerDoc] = useState<Documento | null>(null);
  const [saving, setSaving] = useState(false);

  const avisar = useCallback((msg: string) => {
    setAviso(msg);
    setTimeout(() => setAviso(null), 8000);
  }, []);

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
  }, [avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  const chequearRag = (r: { ragOk?: boolean; ragError?: string }) => {
    if (r?.ragOk === false) avisar(`⚠️ Guardado en la base, pero no se pudo indexar en Vicki: ${r.ragError ?? ""}. Volvé a guardar para reintentar.`);
  };

  const docsVisibles = useMemo(
    () => (sel == null ? docs : docs.filter((d) => d.puestos.some((p) => p.puestoId === sel))),
    [docs, sel],
  );
  const puestoSel = useMemo(() => puestos.find((p) => p.id === sel) ?? null, [puestos, sel]);

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

  // ── subida de archivos ──
  // Un request por archivo: el server crea la fila, extrae el texto, guarda el
  // original e indexa. De a uno para poder decir cuál falló y por qué.
  async function subirArchivos(lista: FileList | null) {
    const files = Array.from(lista ?? []);
    if (!files.length) return;
    if (sel == null) { avisar("❌ Elegí primero el puesto."); return; }

    const problemas: string[] = [];
    let ok = 0;
    setSubiendo({ hechos: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setSubiendo({ hechos: i, total: files.length });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tipo", tipoSubida);
        fd.append("puestoIds", JSON.stringify([sel]));
        try {
          const r = await fetch("/api/rrhh/documentos", { method: "POST", body: fd });
          const j = await r.json().catch(() => null);
          if (!r.ok) { problemas.push(`«${file.name}»: ${j?.error ?? `HTTP ${r.status}`}`); continue; }
          if (j?.archivoError) problemas.push(`«${file.name}»: ${j.archivoError}`);
          if (j?.ragOk === false) problemas.push(`«${file.name}»: no se indexó en Vicki (${j.ragError ?? ""})`);
          ok++;
        } catch (e) {
          problemas.push(`«${file.name}»: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      setSubiendo(null);
      cargar();
    }
    avisar(problemas.length
      ? `${ok} de ${files.length} subido(s). Problemas: ${problemas.join(" · ")}`
      : `✅ ${ok} archivo(s) subido(s) a «${puestoSel?.nombre ?? ""}».`);
  }

  function abrirSelector(tipo: string, puestoId?: number) {
    if (puestoId != null) setSel(puestoId);
    setTipoSubida(tipo);
    // el setState de arriba todavía no se aplicó cuando se abre el diálogo,
    // pero subirArchivos lee `sel`/`tipoSubida` recién en el onChange (ya
    // re-renderizado), así que el valor nuevo es el que vale.
    setTimeout(() => fileRef.current?.click(), 0);
  }

  async function reemplazarArchivo(d: Documento, file: File | null | undefined) {
    if (!file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/rrhh/documentos/${d.id}/archivo`, { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok) { avisar(`❌ ${j?.error ?? `HTTP ${r.status}`}`); return; }
      chequearRag(j);
      avisar(`✅ Archivo reemplazado y re-indexado («${j?.titulo ?? d.titulo}»).`);
      setVerDoc(null);
      cargar();
    } finally { setSaving(false); }
  }

  async function cambiarVigencia(d: Documento, vigente: boolean) {
    setSaving(true);
    try {
      const r = await fetch(`/api/rrhh/documentos/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vigente }),
      });
      const j = await r.json();
      if (!r.ok) { avisar(`❌ ${j.error ?? r.status}`); return; }
      chequearRag(j);
      setVerDoc({ ...d, vigente });
      cargar();
    } finally { setSaving(false); }
  }

  async function borrarDoc(d: Documento) {
    if (!confirm(`¿Borrar "${d.titulo}"? Se elimina también del índice de Vicki.`)) return;
    const r = await fetch(`/api/rrhh/documentos/${d.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) { avisar(`❌ ${j.error ?? r.status}`); return; }
    chequearRag(j);
    setVerDoc(null);
    cargar();
  }

  const inputCls = "w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-yellow-400 transition-colors";
  const puedeSubir = sel != null && !subiendo;

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

      {/* input único de subida, disparado desde varios botones */}
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        accept={ACCEPT}
        onChange={(e) => { subirArchivos(e.target.files); e.target.value = ""; }}
      />

      {/* 40% puestos / 60% archivos */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
        {/* ── columna puestos ── */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Puestos <span className="text-zinc-600 normal-case tracking-normal">({puestos.length})</span>
            </span>
            <button onClick={() => setEditPuesto({})} className="inline-flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300">
              <Plus size={14} /> Nuevo
            </button>
          </div>
          <div className="max-h-[calc(100vh-190px)] overflow-y-auto">
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
                  <button
                    onClick={(e) => { e.stopPropagation(); abrirSelector(TIPO_DESCRIPCION, p.id); }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-emerald-400 p-1"
                    title="Subir la descripción de este puesto"
                  ><ClipboardList size={13} /></button>
                )}
                <button onClick={(e) => { e.stopPropagation(); setEditPuesto(p); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-yellow-400 p-1" title="Editar"><Pencil size={13} /></button>
                <button onClick={(e) => { e.stopPropagation(); borrarPuesto(p); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-1" title="Borrar"><Trash2 size={13} /></button>
              </div>
            ))}
            {!loading && puestos.length === 0 && <div className="px-4 py-6 text-sm text-zinc-600">Sin puestos. Creá el primero con «Nuevo».</div>}
          </div>
        </div>

        {/* ── columna archivos ── */}
        <div
          className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
          onDragOver={(e) => { if (puedeSubir) e.preventDefault(); }}
          onDrop={(e) => { if (!puedeSubir) return; e.preventDefault(); subirArchivos(e.dataTransfer.files); }}
        >
          <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mr-auto">
              {sel == null ? "Todos los documentos" : `Archivos de «${puestoSel?.nombre ?? ""}»`}
            </span>
            <select
              value={tipoSubida}
              onChange={(e) => setTipoSubida(e.target.value)}
              disabled={!puedeSubir}
              className="bg-zinc-950 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-yellow-400 disabled:opacity-40"
              title="Tipo de los archivos que vas a subir"
            >
              <option value="procedimiento">Procedimiento</option>
              <option value="instructivo">Instructivo</option>
              <option value={TIPO_DESCRIPCION}>Descripción de puesto</option>
            </select>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!puedeSubir}
              title={sel == null ? "Elegí primero un puesto" : "Subir archivos a este puesto"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-yellow-300 disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              {subiendo
                ? <><Loader2 size={13} className="animate-spin" /> Subiendo {subiendo.hechos + 1}/{subiendo.total}…</>
                : <><Upload size={13} /> Subir archivos</>}
            </button>
          </div>

          {sel == null ? (
            <div className="px-4 py-3 border-b border-zinc-800/50 text-[12px] text-zinc-500">
              Elegí un puesto a la izquierda para subirle archivos. Acá abajo están todos los documentos cargados.
            </div>
          ) : (
            <div className="px-4 py-3 border-b border-zinc-800/50 text-[12px] text-zinc-500">
              Arrastrá archivos acá o usá «Subir archivos». El título de cada documento va a ser el nombre del archivo sin la extensión, y queda asignado a «{puestoSel?.nombre}».{" "}
              <span className="text-zinc-600">Formatos: {EXT_SOPORTADAS.join(" ")} — el texto se extrae solo (un PDF escaneado sin texto se rechaza).</span>
            </div>
          )}

          {docsVisibles.map((d) => (
            <div key={d.id} className="group flex items-start gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-900">
              {d.tipo === TIPO_DESCRIPCION
                ? <ClipboardList size={16} className="mt-0.5 text-emerald-400 shrink-0" />
                : d.tipo === "procedimiento"
                  ? <BookOpen size={16} className="mt-0.5 text-yellow-400 shrink-0" />
                  : <FileText size={16} className="mt-0.5 text-sky-400 shrink-0" />}
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setVerDoc(d)}>
                <div className={`text-sm ${d.vigente ? "text-zinc-200" : "text-zinc-500 line-through"}`}>
                  {d.titulo} <span className="text-[11px] text-zinc-600">v{d.version}</span>
                  {!d.vigente && <span className="ml-2 text-[10px] uppercase text-red-400/80">no vigente</span>}
                </div>
                <div className="text-[11px] text-zinc-600 truncate">
                  {TIPO_LABEL[d.tipo] ?? d.tipo} · {d.puestos.length ? d.puestos.map((p) => p.puesto.nombre).join(", ") : "sin puesto asignado"}
                  {!d.archivoNombre && <span className="ml-1 text-amber-500/70">· sin archivo (cargado a mano)</span>}
                </div>
              </div>
              {d.archivoNombre && (
                <a href={`/api/rrhh/documentos/${d.id}/archivo`} className="text-zinc-500 hover:text-yellow-400 p-1" title={`Descargar ${d.archivoNombre}`} onClick={(e) => e.stopPropagation()}>
                  <Download size={14} />
                </a>
              )}
              <button onClick={(e) => { e.stopPropagation(); borrarDoc(d); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-1" title="Borrar"><Trash2 size={14} /></button>
            </div>
          ))}
          {!loading && docsVisibles.length === 0 && (
            <div className="px-4 py-6 text-sm text-zinc-600">Sin archivos{sel != null ? " en este puesto" : ""}.</div>
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
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setEditPuesto(null)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancelar</button>
            <button onClick={guardarPuesto} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-yellow-300 disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />} Guardar
            </button>
          </div>
        </Modal>
      )}

      {/* ── modal documento (solo lectura) ── */}
      {verDoc && (
        <Modal titulo={`${TIPO_LABEL[verDoc.tipo] ?? verDoc.tipo} · v${verDoc.version}`} onClose={() => setVerDoc(null)} ancho="max-w-3xl">
          <input
            ref={reemplazoRef}
            type="file"
            className="hidden"
            accept={ACCEPT}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; reemplazarArchivo(verDoc, f); }}
          />
          <div className="text-base text-zinc-100">{verDoc.titulo}</div>
          <div className="mt-1 text-[12px] text-zinc-500">
            {verDoc.puestos.length ? verDoc.puestos.map((p) => p.puesto.nombre).join(", ") : "sin puesto asignado"}
            {verDoc.archivoNombre ? ` · ${verDoc.archivoNombre}` : " · sin archivo original"}
          </div>

          <label className="block text-xs text-zinc-500 mb-1 mt-4">
            Texto que lee Vicki <span className="text-zinc-600">(se extrae del archivo; para cambiarlo, reemplazá el archivo)</span>
          </label>
          <textarea readOnly value={verDoc.contenido} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-400 text-[13px] font-mono rounded-lg px-3 py-2 min-h-[260px] outline-none" />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={verDoc.vigente} disabled={saving} onChange={(e) => cambiarVigencia(verDoc, e.target.checked)} className="accent-yellow-400" />
              Vigente (si lo desmarcás, Vicki deja de usarlo)
            </label>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button onClick={() => borrarDoc(verDoc)} className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10">Borrar</button>
            {verDoc.archivoNombre && (
              <a href={`/api/rrhh/documentos/${verDoc.id}/archivo`} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                <Download size={14} /> Descargar
              </a>
            )}
            <button onClick={() => reemplazoRef.current?.click()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-yellow-300 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Reemplazar archivo
            </button>
          </div>
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
