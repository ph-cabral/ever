// Cliente genérico de Cloudflare Browser Rendering — endpoint /json (Quick
// Action). Renderiza una URL con un Chrome real en la red de Cloudflare y usa
// IA (Workers AI por defecto) para extraer datos estructurados según un
// `prompt` + JSON schema. Pensado para páginas SPA/JS-heavy cuya búsqueda SÍ
// navega a una URL de resultados (esta llamada solo abre una URL y extrae,
// no puede tipear ni hacer clic).
//
// OJO: no está enchufado a ninguna fuente activa hoy. Páginas Amarillas
// necesitó algo más pesado (workers/paginasamarillas-scraper/, Puppeteer)
// porque su búsqueda es client-side y no genera una URL de resultados — ver
// lib/buscador/paginasamarillas.ts. Este cliente queda listo por si en el
// futuro aparece una fuente SPA cuya búsqueda sí se pueda expresar como URL.
//
// Requiere en el .env del server (si se llega a usar):
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_API_TOKEN   (con permiso "Browser Rendering - Edit")
//
// Free tier (plan Workers Free): 10 min de browser/día, máx 1 request cada
// 10s. Si falta cualquiera de las dos variables, se omite (no es fatal) —
// mismo patrón que Google/ML en este módulo.
//
// Doc: https://developers.cloudflare.com/browser-run/quick-actions/json-endpoint/

export interface CfJsonOpts {
  /** URL a renderizar y de la que extraer datos. */
  url: string;
  /** Instrucción en lenguaje natural de qué extraer. */
  prompt: string;
  /** JSON Schema opcional para forzar la forma del resultado. */
  schema?: Record<string, unknown>;
  /** Espera adicional para SPAs que tardan en pintar contenido. */
  waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  /** Selector a esperar antes de extraer (más rápido que waitUntil). */
  waitForSelector?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CfJsonResult<T = unknown> {
  data?: T;
  warning?: string;
}

function credenciales(): { accountId?: string; apiToken?: string } {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim(),
    apiToken: process.env.CLOUDFLARE_API_TOKEN?.trim(),
  };
}

export function cloudflareDisponible(): boolean {
  const { accountId, apiToken } = credenciales();
  return Boolean(accountId && apiToken);
}

/**
 * Llama al endpoint /json de Browser Rendering. Devuelve `warning` (no
 * fatal) si faltan credenciales, si Cloudflare responde error, o si la
 * request falla/tardó demasiado.
 */
export async function cfExtraerJson<T = unknown>(
  opts: CfJsonOpts,
): Promise<CfJsonResult<T>> {
  const { accountId, apiToken } = credenciales();
  if (!accountId || !apiToken) {
    return {
      warning:
        "Cloudflare: falta CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_API_TOKEN en el .env del server. Fuente omitida.",
    };
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/json`;
  const timeoutMs = opts.timeoutMs ?? 45_000;

  const body: Record<string, unknown> = {
    url: opts.url,
    prompt: opts.prompt,
  };
  if (opts.schema) {
    body.response_format = { type: "json_schema", schema: opts.schema };
  }
  if (opts.waitUntil) {
    body.gotoOptions = { waitUntil: opts.waitUntil, timeout: timeoutMs };
  }
  if (opts.waitForSelector) {
    body.waitForSelector = { selector: opts.waitForSelector, timeout: timeoutMs };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      return {
        warning: `Cloudflare: límite de requests alcanzado (429)${retryAfter ? `, reintentar en ${retryAfter}s` : ""}.`,
      };
    }

    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; result?: T; errors?: { message?: string }[] }
      | null;

    if (!res.ok || !json?.success) {
      const detalle = json?.errors?.map((e) => e.message).filter(Boolean).join("; ");
      return {
        warning: `Cloudflare Browser Rendering ${res.status}: ${detalle || "error desconocido"}.`,
      };
    }

    return { data: json.result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { warning: `Cloudflare Browser Rendering: ${msg}` };
  } finally {
    clearTimeout(t);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
