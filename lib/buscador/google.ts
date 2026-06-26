// Cliente de Google Places API (New) — Text Search.
// https://developers.google.com/maps/documentation/places/web-service/text-search
import type { Prospecto } from "./types";
import { matchProvincia } from "./provincias";
import { claveDedupe } from "./util";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

// Campos pedidos. OJO costos: teléfono y web son del SKU "Enterprise" (más caro);
// dirección y tipo del SKU "Pro". Ver BUSCADOR.md.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.addressComponents",
  "nextPageToken",
].join(",");

interface AddrComp {
  longText?: string;
  shortText?: string;
  types?: string[];
}
interface Place {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  addressComponents?: AddrComp[];
}
interface SearchResp {
  places?: Place[];
  nextPageToken?: string;
}

function compDe(p: Place, type: string): AddrComp | undefined {
  return p.addressComponents?.find((c) => c.types?.includes(type));
}

function provinciaDe(p: Place, fallback: string | null): string | null {
  const c = compDe(p, "administrative_area_level_1");
  return matchProvincia(c?.longText ?? p.formattedAddress) ?? fallback;
}

function localidadDe(p: Place): string | null {
  return (
    compDe(p, "locality")?.longText ??
    compDe(p, "administrative_area_level_2")?.longText ??
    null
  );
}

export interface GoogleResult {
  prospectos: Prospecto[];
  warning?: string;
}

/**
 * Busca empresas por artículo. Si `provincia` es "todas" busca a nivel país;
 * si es un nombre canónico, lo agrega al textQuery para sesgar la zona.
 * Devuelve hasta `maxPaginas` x 20 resultados (máx 60 por la API).
 */
export async function buscarGoogle(opts: {
  q: string;
  provincia: string;
  apiKey: string;
  maxPaginas?: number;
  signal?: AbortSignal;
}): Promise<GoogleResult> {
  const { q, provincia, apiKey, signal } = opts;
  const maxPaginas = Math.min(Math.max(opts.maxPaginas ?? 3, 1), 3);
  const enTodo = provincia === "todas" || !provincia;
  const textQuery = enTodo
    ? `${q} en Argentina`
    : `${q} en ${provincia}, Argentina`;

  const prospectos: Prospecto[] = [];
  let pageToken: string | undefined;

  try {
    for (let pagina = 0; pagina < maxPaginas; pagina++) {
      const body: Record<string, unknown> = {
        textQuery,
        languageCode: "es",
        regionCode: "AR",
        pageSize: 20,
      };
      if (pageToken) body.pageToken = pageToken;

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return {
          prospectos,
          warning: `Google Places ${res.status}: ${detail.slice(0, 180)}`,
        };
      }

      const data = (await res.json()) as SearchResp;
      for (const p of data.places ?? []) {
        const nombre = p.displayName?.text?.trim();
        if (!nombre) continue;
        const web = p.websiteUri ?? null;
        const telefono =
          p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null;
        const provinciaP = provinciaDe(p, enTodo ? null : provincia);
        prospectos.push({
          id: claveDedupe({ web, telefono, nombre, provincia: provinciaP }),
          fuente: "google",
          tipo: "empresa",
          nombre,
          rubro: p.primaryTypeDisplayName?.text ?? null,
          provincia: provinciaP,
          localidad: localidadDe(p),
          direccion: p.formattedAddress ?? null,
          telefono,
          whatsapp: null,
          email: null,
          web,
          enlace: p.googleMapsUri ?? null,
          precioDesde: null,
          publicaciones: null,
          notas: null,
        });
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { prospectos, warning: `Google Places: ${msg}` };
  }

  return { prospectos };
}
