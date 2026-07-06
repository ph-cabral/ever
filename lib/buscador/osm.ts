// Cliente de OpenStreetMap (Overpass API) — fuente "empresas" sin costo ni API
// key. Alternativa a Google Places mientras no haya facturación activada en
// Google Cloud (ver BUSCADOR.md).
//
// Límite honesto: Overpass matchea el término contra el tag `name` de cada
// POI (regex, case-insensitive). No hay búsqueda semántica como en Google
// Places: solo aparecen comercios que tienen el artículo/rubro literal en su
// nombre (ej. "Poleas del Sur SRL"), no todo negocio que venda poleas. Y el
// dato de teléfono/email/web depende de que alguien lo haya cargado en OSM,
// bastante más flojo que Google en Argentina.
import type { Prospecto } from "./types";
import { matchProvincia } from "./provincias";
import { claveDedupe } from "./util";

// Varios espejos: el principal (overpass-api.de) suele estar saturado o
// bloquea requests sin User-Agent con un 406. Se prueban en orden.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

// Overpass (como Nominatim) pide identificar la app con un User-Agent real;
// sin esto, algunos espejos devuelven 406 Not Acceptable.
const UA = "EverWearBuscador/1.0 (+https://everwear.com.ar; contacto: sistema@everwear.com.ar)";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildQuery(q: string, provincia: string, limit: number): string {
  const qEsc = escapeRegex(q.trim());
  const enTodo = provincia === "todas" || !provincia;
  const areaClause = enTodo
    ? `area["ISO3166-1"="AR"]["admin_level"="2"]->.searchArea;`
    : `area["admin_level"="4"]["name"~"^${escapeRegex(provincia)}$",i]->.searchArea;`;

  return `[out:json][timeout:25];
${areaClause}
(
  node["name"~"${qEsc}",i](area.searchArea);
  way["name"~"${qEsc}",i](area.searchArea);
);
out center ${limit};`;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
}
interface OverpassResp {
  elements?: OverpassElement[];
}

function rubroDe(tags: Record<string, string>): string | null {
  return tags.shop ?? tags.office ?? tags.craft ?? tags.amenity ?? tags.leisure ?? null;
}

function direccionDe(tags: Record<string, string>): string | null {
  const calle = tags["addr:street"];
  const nro = tags["addr:housenumber"];
  const ciudad = tags["addr:city"];
  const partes = [calle ? `${calle}${nro ? ` ${nro}` : ""}` : null, ciudad ?? null].filter(
    Boolean,
  );
  return partes.length ? partes.join(", ") : null;
}

export interface OsmResult {
  prospectos: Prospecto[];
  warning?: string;
}

/**
 * Ejecuta la query en Overpass probando cada espejo en orden hasta que uno
 * responda 200. Body form-urlencoded (`data=...`) + User-Agent identificado:
 * es el formato más aceptado por los distintos espejos (el raw text/plain a
 * veces devuelve 406 en overpass-api.de).
 */
async function ejecutarQuery(
  query: string,
  signal?: AbortSignal,
): Promise<{ data?: OverpassResp; warning?: string }> {
  // Se acumulan los errores de TODOS los espejos (antes solo se guardaba el
  // último, lo que ocultaba si el problema era puntual de un espejo o algo
  // más de fondo, como que el servidor no tiene salida a internet hacia
  // ninguno de los tres dominios — ej. firewall/proxy corporativo con
  // allowlist).
  const errores: string[] = [];

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": UA,
        },
        body: `data=${encodeURIComponent(query)}`,
        cache: "no-store",
        signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        errores.push(`${endpoint} ${res.status}: ${detail.slice(0, 160)}`);
        continue; // probar el siguiente espejo
      }
      const data = (await res.json()) as OverpassResp;
      return { data };
    } catch (e) {
      errores.push(`${endpoint}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    warning:
      errores.length === ENDPOINTS.length
        ? `OpenStreetMap: fallaron los ${ENDPOINTS.length} espejos — ${errores.join(" | ")}`
        : `OpenStreetMap: ${errores.join(" | ") || "sin respuesta de ningún espejo."}`,
  };
}

/**
 * Busca POIs con nombre en OpenStreetMap. Sin API key: Overpass es un
 * servicio público. Si `provincia` es "todas" busca en toda Argentina
 * (área por ISO3166-1=AR); si no, restringe al área admin de esa provincia.
 */
export async function buscarOsm(opts: {
  q: string;
  provincia: string;
  maxResultados?: number;
  signal?: AbortSignal;
}): Promise<OsmResult> {
  const { q, provincia, signal } = opts;
  const max = Math.min(Math.max(opts.maxResultados ?? 80, 1), 200);
  if (!q.trim()) return { prospectos: [] };

  const query = buildQuery(q, provincia, max);
  const { data, warning } = await ejecutarQuery(query, signal);
  if (!data) return { prospectos: [], warning };

  const prospectos: Prospecto[] = [];

  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const nombre = tags.name?.trim();
    if (!nombre) continue;

    const web = tags.website ?? tags["contact:website"] ?? null;
    const telefono = tags.phone ?? tags["contact:phone"] ?? null;
    const email = tags.email ?? tags["contact:email"] ?? null;
    const whatsapp = tags["contact:whatsapp"] ?? null;
    const provinciaP =
      provincia !== "todas" && provincia
        ? provincia
        : matchProvincia(tags["addr:state"] ?? tags["addr:province"]);

    prospectos.push({
      id: claveDedupe({ web, telefono, nombre, provincia: provinciaP }),
      fuente: "osm",
      tipo: "empresa",
      nombre,
      rubro: rubroDe(tags),
      provincia: provinciaP,
      localidad: tags["addr:city"] ?? tags["addr:suburb"] ?? null,
      direccion: direccionDe(tags),
      telefono,
      whatsapp,
      email,
      web,
      enlace: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      precioDesde: null,
      publicaciones: null,
      notas: null,
    });
  }

  return { prospectos: prospectos.slice(0, max) };
}
