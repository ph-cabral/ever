"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Search,
  Loader2,
  Download,
  Phone,
  Mail,
  Globe,
  MessageCircle,
  Building2,
  Store,
  X,
  AlertTriangle,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { PROVINCIAS } from "@/lib/buscador/provincias";
import type { BuscarResponse, Fuente, Prospecto } from "@/lib/buscador/types";
import { exportarExcel } from "@/lib/buscador/export";

const MESES_OP = [3, 6, 12, 24, 36];

function puntaje(p: Prospecto): number {
  return (
    (p.telefono ? 2 : 0) +
    (p.whatsapp ? 2 : 0) +
    (p.email ? 2 : 0) +
    (p.web ? 1 : 0) +
    (p.direccion ? 1 : 0)
  );
}

function ordenar(list: Prospecto[]): Prospecto[] {
  return [...list].sort(
    (a, b) => puntaje(b) - puntaje(a) || a.nombre.localeCompare(b.nombre),
  );
}

function mergeClient(ex: Prospecto, p: Prospecto): void {
  ex.telefono ??= p.telefono;
  ex.whatsapp ??= p.whatsapp;
  ex.email ??= p.email;
  ex.web ??= p.web;
  ex.direccion ??= p.direccion;
  ex.provincia ??= p.provincia;
  ex.localidad ??= p.localidad;
  ex.enlace ??= p.enlace;
  ex.rubro ??= p.rubro;
  if (p.precioDesde != null && (ex.precioDesde == null || p.precioDesde < ex.precioDesde)) {
    ex.precioDesde = p.precioDesde;
  }
  if (p.publicaciones != null) ex.publicaciones = (ex.publicaciones ?? 0) + p.publicaciones;
}

function waHref(wa: string): string {
  if (/^https?:\/\//i.test(wa)) return wa;
  return `https://wa.me/${wa.replace(/\D+/g, "")}`;
}
function telHref(t: string): string {
  return `tel:${t.replace(/[^\d+]/g, "")}`;
}
function mailHref(e: string): string {
  return `mailto:${e.split(",")[0].trim()}`;
}

interface Progreso {
  hechas: number;
  total: number;
  actual: string | null;
}

export default function BuscadorPage() {
  const [q, setQ] = useState("");
  const [provincia, setProvincia] = useState("todas");
  const [fuentes, setFuentes] = useState({
    google: true,
    mercadolibre: true,
    osm: true,
    cylex: true,
  });
  const [enriquecer, setEnriquecer] = useState(true);
  const [meses, setMeses] = useState(12);

  const [running, setRunning] = useState(false);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [results, setResults] = useState<Prospecto[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const resumen = useMemo(() => {
    let empresas = 0,
      vendedores = 0,
      conTel = 0,
      conWa = 0,
      conMail = 0;
    for (const p of results) {
      if (p.tipo === "empresa") empresas++;
      else vendedores++;
      if (p.telefono) conTel++;
      if (p.whatsapp) conWa++;
      if (p.email) conMail++;
    }
    return { empresas, vendedores, conTel, conWa, conMail };
  }, [results]);

  async function ejecutar() {
    if (!q.trim()) {
      toast.error("Escribí un artículo para buscar (ej. poleas).");
      return;
    }
    const fuentesArr: Fuente[] = [];
    if (fuentes.google) fuentesArr.push("google");
    if (fuentes.mercadolibre) fuentesArr.push("mercadolibre");
    if (fuentes.osm) fuentesArr.push("osm");
    if (fuentes.cylex) fuentesArr.push("cylex");
    if (fuentesArr.length === 0) {
      toast.error("Elegí al menos una fuente.");
      return;
    }

    const provs = provincia === "todas" ? PROVINCIAS : [provincia];
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const mapa = new Map<string, Prospecto>();
    const warnSet = new Set<string>();

    setRunning(true);
    setResults([]);
    setWarnings([]);
    setProgreso({ hechas: 0, total: provs.length, actual: provs[0] });

    try {
      for (let idx = 0; idx < provs.length; idx++) {
        if (ctrl.signal.aborted) break;
        const prov = provs[idx];
        setProgreso({ hechas: idx, total: provs.length, actual: prov });

        let data: BuscarResponse | null = null;
        try {
          const res = await fetch("/api/buscador", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              q: q.trim(),
              provincia: prov,
              fuentes: fuentesArr,
              enriquecer,
              meses,
            }),
            signal: ctrl.signal,
          });
          if (!res.ok) {
            const e = (await res.json().catch(() => null)) as { error?: string } | null;
            warnSet.add(`${prov}: ${e?.error ?? `HTTP ${res.status}`}`);
          } else {
            data = (await res.json()) as BuscarResponse;
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") break;
          warnSet.add(`${prov}: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (data) {
          for (const p of data.results) {
            const ex = mapa.get(p.id);
            if (!ex) mapa.set(p.id, p);
            else mergeClient(ex, p);
          }
          for (const w of data.warnings) warnSet.add(w);
          setResults(ordenar([...mapa.values()]));
          setWarnings([...warnSet]);
        }
      }
      setProgreso((pr) => (pr ? { ...pr, hechas: pr.total, actual: null } : null));
      if (!ctrl.signal.aborted) {
        toast.success(`${mapa.size} prospectos encontrados.`);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function cancelar() {
    abortRef.current?.abort();
    setRunning(false);
  }

  const pct = progreso ? Math.round((progreso.hechas / progreso.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex items-center justify-between px-6 md:px-8 h-16">
        <div className="flex items-center gap-4">
          <span className="font-bold text-yellow-400 text-2xl tracking-wide uppercase">
            EVER WEAR <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="w-px h-7 bg-yellow-400/30" />
          <span className="text-zinc-400 text-sm">Buscador de clientes</span>
        </div>
        <button
          onClick={() => exportarExcel(results, q || "busqueda")}
          disabled={results.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 text-black px-4 py-2 text-sm font-semibold hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={16} /> Exportar a Excel
        </button>
      </header>

      <main className="max-w-[1500px] mx-auto px-4 md:px-8 py-6">
        {/* Controles */}
        <div className="bg-[#1A1A1A] border border-zinc-800 rounded-2xl p-5">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 mb-1">Artículo a buscar</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !running && ejecutar()}
                  placeholder="ej. poleas, rodamientos, mangueras hidráulicas…"
                  className="w-full bg-[#111111] border border-zinc-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Provincia</label>
              <select
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                className="bg-[#111111] border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:border-yellow-400 outline-none min-w-[180px]"
              >
                <option value="todas">Todo el país</option>
                {PROVINCIAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Publicaciones hasta</label>
              <select
                value={meses}
                onChange={(e) => setMeses(Number(e.target.value))}
                className="bg-[#111111] border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:border-yellow-400 outline-none"
              >
                {MESES_OP.map((m) => (
                  <option key={m} value={m}>
                    {m} meses
                  </option>
                ))}
              </select>
            </div>

            {!running ? (
              <button
                onClick={ejecutar}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-400 text-black px-6 py-2.5 text-sm font-semibold hover:bg-yellow-300 transition-colors"
              >
                <Search size={16} /> Buscar
              </button>
            ) : (
              <button
                onClick={cancelar}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-6 py-2.5 text-sm font-semibold hover:bg-red-500 transition-colors"
              >
                <X size={16} /> Cancelar
              </button>
            )}
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={fuentes.google}
                onChange={(e) => setFuentes((f) => ({ ...f, google: e.target.checked }))}
                className="accent-yellow-400"
              />
              Google Maps <span className="text-zinc-600">(empresas: dirección, teléfono, web)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={fuentes.mercadolibre}
                onChange={(e) => setFuentes((f) => ({ ...f, mercadolibre: e.target.checked }))}
                className="accent-yellow-400"
              />
              MercadoLibre <span className="text-zinc-600">(vendedores y publicaciones)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={fuentes.osm}
                onChange={(e) => setFuentes((f) => ({ ...f, osm: e.target.checked }))}
                className="accent-yellow-400"
              />
              OpenStreetMap{" "}
              <span className="text-zinc-600">(empresas, gratis, sin API key)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={fuentes.cylex}
                onChange={(e) => setFuentes((f) => ({ ...f, cylex: e.target.checked }))}
                className="accent-yellow-400"
              />
              Cylex{" "}
              <span className="text-zinc-600">(directorio de empresas, gratis, sin API key)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={enriquecer}
                onChange={(e) => setEnriquecer(e.target.checked)}
                className="accent-yellow-400"
              />
              Buscar email / WhatsApp en las webs <span className="text-zinc-600">(más lento)</span>
            </label>
          </div>
        </div>

        {/* Progreso */}
        {progreso && running && (
          <div className="mt-4 bg-[#1A1A1A] border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-sm text-zinc-300 mb-2">
              <span className="flex items-center gap-2">
                <Loader2 size={15} className="animate-spin text-yellow-400" />
                Buscando {progreso.actual ? `en ${progreso.actual}` : "…"}
              </span>
              <span className="text-zinc-500">
                {progreso.hechas}/{progreso.total} · {results.length} encontrados
              </span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Avisos */}
        {warnings.length > 0 && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200">
            <div className="flex items-center gap-2 font-medium mb-1">
              <AlertTriangle size={15} /> Avisos
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-amber-200/80">
              {warnings.slice(0, 8).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Resumen */}
        {results.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip label="Total" value={results.length} />
            <Chip label="Empresas" value={resumen.empresas} icon={<Building2 size={13} />} />
            <Chip label="Vendedores ML" value={resumen.vendedores} icon={<Store size={13} />} />
            <Chip label="Con teléfono" value={resumen.conTel} icon={<Phone size={13} />} />
            <Chip label="Con WhatsApp" value={resumen.conWa} icon={<MessageCircle size={13} />} />
            <Chip label="Con email" value={resumen.conMail} icon={<Mail size={13} />} />
          </div>
        )}

        {/* Tabla */}
        <div className="mt-4 bg-[#1A1A1A] border border-zinc-800 rounded-2xl overflow-hidden">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <Search size={42} className="text-zinc-700" />
              <p className="text-zinc-400 font-medium">Todavía no hay resultados</p>
              <p className="text-zinc-600 text-sm max-w-md">
                Escribí un artículo, elegí provincia (o todo el país) y tocá Buscar. Después podés
                exportar todo a Excel.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#242424] text-zinc-400 sticky top-16">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Ubicación</th>
                    <th className="px-4 py-3 font-medium">Dirección</th>
                    <th className="px-4 py-3 font-medium">Teléfono</th>
                    <th className="px-4 py-3 font-medium">WhatsApp</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Web</th>
                    <th className="px-4 py-3 font-medium">Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((p) => (
                    <tr key={p.id} className="border-t border-zinc-800 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 max-w-[260px]">
                        <div className="font-medium text-zinc-100 truncate">{p.nombre}</div>
                        {(p.rubro || p.publicaciones || p.precioDesde != null) && (
                          <div className="text-xs text-zinc-500 truncate">
                            {p.rubro}
                            {p.publicaciones ? ` · ${p.publicaciones} publicaciones` : ""}
                            {p.precioDesde != null
                              ? ` · desde $${p.precioDesde.toLocaleString("es-AR")}`
                              : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                            p.tipo === "empresa"
                              ? "bg-cyan-500/15 text-cyan-300"
                              : "bg-purple-500/15 text-purple-300"
                          }`}
                        >
                          {p.tipo === "empresa" ? <Building2 size={11} /> : <Store size={11} />}
                          {p.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        <div className="flex items-center gap-1">
                          {p.provincia && <MapPin size={12} className="text-zinc-600" />}
                          <span>{p.provincia ?? "—"}</span>
                        </div>
                        {p.localidad && <div className="text-xs text-zinc-500">{p.localidad}</div>}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 max-w-[220px]">
                        <span className="line-clamp-2">{p.direccion ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {p.telefono ? (
                          <a href={telHref(p.telefono)} className="text-zinc-200 hover:text-yellow-400 whitespace-nowrap">
                            {p.telefono}
                          </a>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.whatsapp ? (
                          <a
                            href={waHref(p.whatsapp)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-green-400 hover:text-green-300 whitespace-nowrap"
                          >
                            <MessageCircle size={13} /> {p.whatsapp.replace(/^https?:\/\/\S*\//, "")}
                          </a>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        {p.email ? (
                          <a href={mailHref(p.email)} className="text-zinc-200 hover:text-yellow-400 truncate block">
                            {p.email}
                          </a>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.web && (
                            <a
                              href={p.web}
                              target="_blank"
                              rel="noreferrer"
                              title="Sitio web"
                              className="text-zinc-300 hover:text-yellow-400"
                            >
                              <Globe size={15} />
                            </a>
                          )}
                          {p.enlace && (
                            <a
                              href={p.enlace}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir ficha / publicación"
                              className="text-zinc-300 hover:text-yellow-400"
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}
                          {!p.web && !p.enlace && <span className="text-zinc-600">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-zinc-500">
                          {p.fuente === "google"
                            ? "Google"
                            : p.fuente === "mercadolibre"
                              ? "MercadoLibre"
                              : p.fuente === "cylex"
                                ? "Cylex"
                                : "OSM"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-zinc-600 leading-relaxed">
          <strong className="text-zinc-500">Empresa</strong>: ficha de Google Maps (dirección y
          teléfono públicos). <strong className="text-zinc-500">Vendedor</strong>: publica en
          MercadoLibre — su teléfono/email no son públicos, sirve para detectar quién vende el
          rubro y dónde. El email y WhatsApp se intentan extraer de la web de cada empresa cuando
          está disponible.
        </p>
      </main>
    </div>
  );
}

function Chip({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800/70 border border-zinc-700 px-3 py-1 text-xs text-zinc-300">
      {icon}
      {label}: <span className="text-yellow-400 font-semibold">{value}</span>
    </span>
  );
}
