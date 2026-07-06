// Cliente de la API de MercadoLibre (sitio MLA = Argentina).
// Toda llamada requiere un access token Bearer. Soporta:
//   - ML_ACCESS_TOKEN  (token directo, vence ~6 h)
//   - ML_CLIENT_ID + ML_CLIENT_SECRET + ML_REFRESH_TOKEN (refresca solo)
// Si no hay credenciales, se omite la fuente con un aviso (no es fatal).
import type { Prospecto } from "./types";
import { matchProvincia } from "./provincias";

const API = "https://api.mercadolibre.com";

// Cache en memoria del proceso (se pierde al reiniciar el contenedor).
let cachedToken: { value: string; exp: number } | null = null;
let cachedRefresh: string | null = null;

async function getAccessToken(
  signal?: AbortSignal,
): Promise<{ token?: string; warning?: string }> {
  const direct = process.env.ML_ACCESS_TOKEN?.trim();
  if (direct) return { token: direct };

  const clientId = process.env.ML_CLIENT_ID?.trim();
  const clientSecret = process.env.ML_CLIENT_SECRET?.trim();
  const refresh = cachedRefresh ?? process.env.ML_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refresh) {
    return {
      warning:
        "MercadoLibre: sin credenciales (ML_ACCESS_TOKEN, o ML_CLIENT_ID/ML_CLIENT_SECRET/ML_REFRESH_TOKEN). Fuente omitida.",
    };
  }

  if (cachedToken && cachedToken.exp > Date.now() + 30_000) {
    return { token: cachedToken.value };
  }

  try {
    const res = await fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
      }),
      cache: "no-store",
      signal,
    });
    if (!res.ok) {
      const d = await res.text().catch(() => "");
      return { warning: `MercadoLibre OAuth ${res.status}: ${d.slice(0, 160)}` };
    }
    const j = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!j.access_token) {
      return { warning: "MercadoLibre OAuth: respuesta sin access_token." };
    }
    cachedToken = {
      value: j.access_token,
      exp: Date.now() + (j.expires_in ?? 21600) * 1000,
    };
    // El refresh token rota en cada uso: lo guardamos en memoria para los
    // próximos refresh dentro de la vida del proceso.
    if (j.refresh_token) cachedRefresh = j.refresh_token;
    return { token: j.access_token };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { warning: `MercadoLibre OAuth: ${msg}` };
  }
}

interface MLItem {
  id?: string;
  title?: string;
  price?: number;
  permalink?: string;
  seller?: { id?: number; nickname?: string };
  address?: {
    state_id?: string;
    state_name?: string;
    city_id?: string;
    city_name?: string;
  };
}
interface MLSearchResp {
  results?: MLItem[];
  paging?: { total?: number; offset?: number; limit?: number };
}

export interface MLResult {
  prospectos: Prospecto[];
  warning?: string;
}

const MULTIGET_CHUNK = 20; // límite de la API para /items?ids=

/** Antigüedad máxima en meses -> fecha de corte. null si no hay que filtrar. */
function cutoffDesdeMeses(meses?: number): Date | null {
  if (!meses || meses <= 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d;
}

/**
 * Trae `date_created` de una tanda de items vía multiget (GET /items?ids=).
 * Best-effort: si un chunk falla, esos ids quedan sin fecha y no se filtran
 * (se prefiere no perder resultados por un error transitorio de la API).
 */
async function fetchFechas(
  ids: string[],
  token: string,
  signal?: AbortSignal,
): Promise<Map<string, string | null>> {
  const fechas = new Map<string, string | null>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += MULTIGET_CHUNK) {
    chunks.push(ids.slice(i, i + MULTIGET_CHUNK));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      if (chunk.length === 0) return;
      try {
        const url = `${API}/items?ids=${chunk.join(",")}&attributes=id,date_created`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          cache: "no-store",
          signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          body?: { id?: string; date_created?: string };
        }[];
        for (const r of data) {
          if (r.body?.id) fechas.set(r.body.id, r.body.date_created ?? null);
        }
      } catch {
        // best-effort, ver comentario arriba
      }
    }),
  );

  return fechas;
}

/**
 * Busca publicaciones activas por artículo y las agrupa por vendedor.
 * Nota: ML no expone teléfono/email del vendedor por privacidad; el valor está
 * en descubrir vendedores activos, su ubicación y volumen de publicaciones.
 * `meses` filtra por antigüedad de la publicación (date_created), vía un
 * lookup adicional a /items (la búsqueda no trae esa fecha).
 */
export async function buscarMercadoLibre(opts: {
  q: string;
  provincia: string;
  maxPaginas?: number;
  meses?: number;
  signal?: AbortSignal;
}): Promise<MLResult> {
  const { q, provincia, signal } = opts;
  const maxPaginas = Math.min(Math.max(opts.maxPaginas ?? 4, 1), 10);
  const filtrarProv = provincia !== "todas" && !!provincia;
  const cutoff = cutoffDesdeMeses(opts.meses);

  const { token, warning } = await getAccessToken(signal);
  if (!token) return { prospectos: [], warning };

  const porVendedor = new Map<string, Prospecto>();

  try {
    for (let pagina = 0; pagina < maxPaginas; pagina++) {
      const offset = pagina * 50;
      const url = `${API}/sites/MLA/search?q=${encodeURIComponent(
        q,
      )}&limit=50&offset=${offset}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal,
      });
      if (!res.ok) {
        const d = await res.text().catch(() => "");
        return {
          prospectos: [...porVendedor.values()],
          warning: `MercadoLibre ${res.status}: ${d.slice(0, 160)}`,
        };
      }
      const data = (await res.json()) as MLSearchResp;
      const items = data.results ?? [];
      if (items.length === 0) break;

      const fechas = cutoff
        ? await fetchFechas(
            items.map((it) => it.id).filter((id): id is string => !!id),
            token,
            signal,
          )
        : null;

      for (const it of items) {
        const prov = matchProvincia(it.address?.state_name);
        if (filtrarProv && prov !== provincia) continue;
        if (cutoff && it.id) {
          const fecha = fechas?.get(it.id);
          if (fecha && new Date(fecha) < cutoff) continue; // publicación vieja
        }
        const sellerId = it.seller?.id != null ? String(it.seller.id) : null;
        if (!sellerId) continue;
        const key = `ml:${sellerId}`;
        const precio = typeof it.price === "number" ? it.price : null;
        const ex = porVendedor.get(key);
        if (ex) {
          ex.publicaciones = (ex.publicaciones ?? 0) + 1;
          if (precio != null && (ex.precioDesde == null || precio < ex.precioDesde)) {
            ex.precioDesde = precio;
          }
          if (!ex.provincia && prov) ex.provincia = prov;
          if (!ex.localidad && it.address?.city_name) {
            ex.localidad = it.address.city_name;
          }
        } else {
          porVendedor.set(key, {
            id: key,
            fuente: "mercadolibre",
            tipo: "vendedor",
            nombre: it.seller?.nickname?.trim() || `Vendedor ML #${sellerId}`,
            rubro: null,
            provincia: prov,
            localidad: it.address?.city_name ?? null,
            direccion: null,
            telefono: null,
            whatsapp: null,
            email: null,
            web: null,
            enlace: it.permalink ?? null,
            precioDesde: precio,
            publicaciones: 1,
            notas: "Vendedor en MercadoLibre",
            terminoBuscado: null,
          });
        }
      }

      const total = data.paging?.total ?? 0;
      if (offset + 50 >= total) break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      prospectos: [...porVendedor.values()],
      warning: `MercadoLibre: ${msg}`,
    };
  }

  return { prospectos: [...porVendedor.values()] };
}
