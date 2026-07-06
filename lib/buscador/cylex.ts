// Cliente de Cylex (directorio de negocios de Argentina) — fuente "empresas"
// sin costo ni API key. Complementa a Google Places (pago) y OSM (gratis,
// pero con muy poca carga de comercios en AR).
//
// Cylex es un sitio server-rendered clásico (no una SPA), así que alcanza con
// pedir el HTML de la página de resultados y parsearlo con regex — no hace
// falta un browser headless. Cada búsqueda cae en una URL predecible:
//   https://www.cylex.com.ar/{palabra}.html        (página 1)
//   https://www.cylex.com.ar/{palabra}-{n}.html    (página n, n>=2)
// Confirmado a mano (06-jul-2026) contra /poleas.html: 168 resultados, 20 por
// página, con nombre/dirección/teléfono visibles sin login ni JS.
//
// El robots.txt de cylex.com.ar deshabilita explícitamente el endpoint de
// búsqueda con filtros `/s?...` (excepto para Mediapartners-Google) — por eso
// esta fuente NUNCA pega contra `/s?`, solo contra las páginas `/{palabra}[-n].html`
// que sí están permitidas. No hay forma de filtrar por provincia del lado del
// servidor sin usar `/s?`, así que se trae la lista completa por artículo y se
// filtra client-side con `matchProvincia` sobre la dirección de cada ficha.
//
// OJO — estructura inferida a partir del HTML real (visto una vez, a mano,
// el 06-jul-2026), no de documentación oficial de Cylex. Si en algún momento
// esta fuente empieza a devolver 0 resultados de forma sistemática, lo más
// probable es que Cylex haya cambiado el markup de la página y haya que
// ajustar los regex de abajo (no es necesariamente un problema de red).
import type { Prospecto } from "./types";
import { matchProvincia } from "./provincias";
import { claveDedupe } from "./util";

const UA =
  "Mozilla/5.0 (compatible; EverWearBuscador/1.0; +https://everwear.com.ar; contacto: sistema@everwear.com.ar)";
const BASE = "https://www.cylex.com.ar";
const RESULTADOS_POR_PAGINA = 20;
const MAX_PAGINAS = 10; // tope duro, no importa cuán grande sea "total".

function slug(q: string): string {
  return encodeURIComponent(q.trim()).replace(/%20/g, "+");
}

function urlPagina(q: string, pagina: number): string {
  const s = slug(q);
  return pagina <= 1 ? `${BASE}/${s}.html` : `${BASE}/${s}-${pagina}.html`;
}

async function fetchHtml(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/html/i.test(ct)) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}

function totalResultados(html: string): number | null {
  const m = html.match(/Resultados\s+\d+\s*-\s*\d+\s+de\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

// Ficha de detalle: <a href="https://www.cylex.com.ar/{ciudad}/{slug}-{id}.html">Nombre</a>
function reDetalle(): RegExp {
  return /<a[^>]+href="(https:\/\/www\.cylex\.com\.ar\/[a-z0-9%\-]+\/[a-z0-9%\-]+-(\d+)\.html)"[^>]*>([^<]{2,120})<\/a>/gi;
}
const RE_TEL = /href="tel:\+?([0-9()\-\s]{6,})"/i;
// "Calle 123, 5000 Ciudad" — heurístico, puede fallar con formatos raros.
const RE_DIRECCION =
  /([A-ZÁÉÍÓÚÑ][^<>\n,]{3,70}),\s*([A-Z]{0,2}\d{3,5})\s+([A-ZÁÉÍÓÚÑ][^<>\n,]{2,50})/;

function parsePagina(html: string): Prospecto[] {
  const prospectos: Prospecto[] = [];
  const vistos = new Set<string>();
  const re = reDetalle();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, enlace, id, nombreRaw] = m;
    if (vistos.has(id)) continue;
    vistos.add(id);
    const nombre = nombreRaw.trim();
    if (!nombre || /^(ver más|más info)$/i.test(nombre)) continue;

    // Ventana de texto siguiente al link: ahí suele estar tel/dirección de
    // esa misma ficha (antes de que empiece la siguiente).
    const ventana = html.slice(m.index, m.index + 1500);

    const telMatch = ventana.match(RE_TEL);
    const telefono = telMatch ? telMatch[1].trim() : null;

    const dirMatch = ventana.match(RE_DIRECCION);
    const direccion = dirMatch
      ? `${dirMatch[1].trim()}, ${dirMatch[3].trim()}`
      : null;
    const localidad = dirMatch ? dirMatch[3].trim() : null;
    const provinciaP = matchProvincia(direccion);

    prospectos.push({
      id: claveDedupe({ web: null, telefono, nombre, provincia: provinciaP }),
      fuente: "cylex",
      tipo: "empresa",
      nombre,
      rubro: null,
      provincia: provinciaP,
      localidad,
      direccion,
      telefono,
      whatsapp: null,
      email: null,
      web: null,
      enlace,
      precioDesde: null,
      publicaciones: null,
      notas: null,
      terminoBuscado: null,
    });
  }
  return prospectos;
}

export interface CylexResult {
  prospectos: Prospecto[];
  warning?: string;
}

/**
 * Busca en Cylex por artículo. Sin filtro de provincia del lado del servidor
 * (ver nota arriba sobre robots.txt) — recorre hasta `MAX_PAGINAS` páginas del
 * listado general y filtra por provincia en memoria si corresponde.
 */
export async function buscarCylex(opts: {
  q: string;
  provincia: string;
  maxResultados?: number;
  signal?: AbortSignal;
}): Promise<CylexResult> {
  const { q, provincia, signal } = opts;
  const max = Math.min(Math.max(opts.maxResultados ?? 100, 1), 300);
  if (!q.trim()) return { prospectos: [] };

  const primera = await fetchHtml(urlPagina(q, 1), 8000, signal);
  if (!primera) {
    return {
      prospectos: [],
      warning: "Cylex: no se pudo obtener la página de resultados (fetch falló o bloqueado).",
    };
  }

  const acumulado = parsePagina(primera);
  const total = totalResultados(primera);
  const totalPaginas = total
    ? Math.ceil(total / RESULTADOS_POR_PAGINA)
    : 1;
  const paginasAExplorar = Math.min(totalPaginas, MAX_PAGINAS);

  for (let p = 2; p <= paginasAExplorar; p++) {
    if (signal?.aborted) break;
    // Si ya no filtramos por provincia y alcanzamos el máximo pedido, cortamos.
    if (provincia === "todas" && acumulado.length >= max) break;
    const html = await fetchHtml(urlPagina(q, p), 8000, signal);
    if (!html) break;
    acumulado.push(...parsePagina(html));
  }

  const filtrados =
    provincia && provincia !== "todas"
      ? acumulado.filter((p) => !p.provincia || p.provincia === provincia)
      : acumulado;

  return { prospectos: filtrados.slice(0, max) };
}
