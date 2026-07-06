// Cliente de "Páginas Amarillas" — en realidad le pega a un Cloudflare
// Worker propio (workers/paginasamarillas-scraper/), NO directo al sitio ni
// a la API REST simple de Cloudflare. Motivo: la búsqueda de
// paginasamarillas.com.ar es client-side (no genera una URL de resultados),
// así que hace falta un browser que escriba y haga clic — eso solo lo puede
// hacer Puppeteer corriendo en un Worker con browser binding, ver el README
// de esa carpeta y el comentario en su src/index.ts.
//
// Variables de entorno (server de Next.js):
//   PA_WORKER_URL     — URL pública del Worker deployado (wrangler deploy)
//   PA_WORKER_SECRET  — opcional, si el Worker está protegido con SHARED_SECRET
import type { Prospecto } from "./types";
import { matchProvincia } from "./provincias";
import { claveDedupe } from "./util";

interface EmpresaWorker {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  localidad: string | null;
}

interface RespuestaWorker {
  success: boolean;
  q?: string;
  empresas?: EmpresaWorker[];
  debug?: string[];
  error?: string;
}

export interface PaginasAmarillasResult {
  prospectos: Prospecto[];
  warning?: string;
}

export async function buscarPaginasAmarillas(opts: {
  q: string;
  provincia: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<PaginasAmarillasResult> {
  const { q, provincia, signal } = opts;
  if (!q.trim()) return { prospectos: [] };

  const workerUrl = process.env.PA_WORKER_URL?.trim();
  if (!workerUrl) {
    return {
      prospectos: [],
      warning:
        "Páginas Amarillas: falta PA_WORKER_URL en el .env del server (Worker de Cloudflare sin deployar/configurar). Fuente omitida.",
    };
  }

  const timeoutMs = opts.timeoutMs ?? 45_000; // el Worker abre un browser real, es lento.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const secret = process.env.PA_WORKER_SECRET?.trim();
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const res = await fetch(workerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        q,
        provincia: provincia !== "todas" ? provincia : undefined,
      }),
      cache: "no-store",
      signal: ctrl.signal,
    });

    const data = (await res.json().catch(() => null)) as RespuestaWorker | null;

    if (!res.ok || !data?.success) {
      return {
        prospectos: [],
        warning: `Páginas Amarillas: ${data?.error ?? `HTTP ${res.status}`}.`,
      };
    }

    const prospectos: Prospecto[] = (data.empresas ?? [])
      .filter((e) => e.nombre?.trim())
      .map((e) => {
        const provinciaP = matchProvincia(e.direccion ?? e.localidad ?? "");
        return {
          id: claveDedupe({
            web: null,
            telefono: e.telefono,
            nombre: e.nombre,
            provincia: provinciaP,
          }),
          fuente: "paginasamarillas" as const,
          tipo: "empresa" as const,
          nombre: e.nombre.trim(),
          rubro: null,
          provincia: provinciaP,
          localidad: e.localidad ?? null,
          direccion: e.direccion ?? null,
          telefono: e.telefono ?? null,
          whatsapp: null,
          email: null,
          web: null,
          enlace: null,
          precioDesde: null,
          publicaciones: null,
          notas: null,
        };
      });

    return { prospectos };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { prospectos: [], warning: `Páginas Amarillas: ${msg}` };
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}
