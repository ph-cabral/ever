// Enriquecimiento best-effort: visita la web de cada prospecto e intenta extraer
// email, WhatsApp y teléfono de la home y de páginas de contacto típicas.
// Limitado por timeout, concurrencia y cantidad; respeta un AbortSignal global.
import type { Prospecto } from "./types";
import { dominio, soloDigitos } from "./util";

const UA =
  "Mozilla/5.0 (compatible; EverWearBot/1.0; +https://everwear.com.ar)";

const RE_EMAIL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const RE_WA =
  /(?:https?:\/\/)?(?:api\.whatsapp\.com\/send\?phone=|wa\.me\/|wa\.link\/)([0-9+\-\s]{6,})/i;
const RE_WA_PROTO = /whatsapp:\/\/send\?phone=([0-9+\-\s]{6,})/i;
const RE_TEL = /tel:\+?([0-9()\-\s]{6,})/i;

const RUTAS_CONTACTO = ["", "/contacto", "/contact"];

function esEmailJunk(e: string): boolean {
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(e)) return true;
  return [
    "sentry",
    "wixpress",
    "example.",
    "yourdomain",
    "domain.com",
    "tu-email",
    "@2x",
  ].some((s) => e.includes(s));
}

async function fetchTexto(
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
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/text|html|xml/i.test(ct)) return null;
    const txt = await res.text();
    return txt.slice(0, 500_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}

function extraerEmails(html: string, dom: string | null): string | null {
  const found = html.match(RE_EMAIL) ?? [];
  const limpios = found
    .map((e) => e.toLowerCase())
    .filter((e) => !esEmailJunk(e));
  if (limpios.length === 0) return null;
  if (dom) {
    const mismo = limpios.find((e) => e.split("@")[1]?.endsWith(dom));
    if (mismo) return mismo;
  }
  const uniq = [...new Set(limpios)];
  return uniq.slice(0, 2).join(", ");
}

function extraerWhatsapp(html: string): string | null {
  const m = html.match(RE_WA) ?? html.match(RE_WA_PROTO);
  if (m && m[1]) {
    const num = soloDigitos(m[1]);
    if (num.length >= 8) return num;
  }
  return null;
}

function extraerTel(html: string): string | null {
  const m = html.match(RE_TEL);
  if (m && m[1] && soloDigitos(m[1]).length >= 7) return m[1].trim();
  return null;
}

async function enriquecerUno(
  p: Prospecto,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!p.web) return;
  const dom = dominio(p.web);
  let baseUrl: URL;
  try {
    baseUrl = new URL(/^https?:\/\//i.test(p.web) ? p.web : `https://${p.web}`);
  } catch {
    return;
  }

  for (const ruta of RUTAS_CONTACTO) {
    if (signal?.aborted) return;
    const url = ruta ? new URL(ruta, baseUrl).toString() : baseUrl.toString();
    const html = await fetchTexto(url, timeoutMs, signal);
    if (!html) continue;
    if (!p.email) p.email = extraerEmails(html, dom);
    if (!p.whatsapp) p.whatsapp = extraerWhatsapp(html);
    if (!p.telefono) p.telefono = extraerTel(html);
    if (p.email && p.whatsapp) break;
  }
}

/**
 * Enriquece in-place los prospectos con web. Devuelve cuántos sumaron al menos
 * un dato de contacto nuevo (email o WhatsApp).
 */
export async function enriquecer(opts: {
  prospectos: Prospecto[];
  max?: number;
  concurrencia?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<number> {
  const { prospectos, signal } = opts;
  const max = opts.max ?? 25;
  const concurrencia = Math.min(Math.max(opts.concurrencia ?? 8, 1), 12);
  const timeoutMs = opts.timeoutMs ?? 6000;

  const objetivos = prospectos
    .filter((p) => p.web && (!p.email || !p.whatsapp))
    .slice(0, max);

  let enriquecidos = 0;
  let i = 0;

  async function worker(): Promise<void> {
    while (i < objetivos.length) {
      if (signal?.aborted) return;
      const p = objetivos[i++];
      const antes = (p.email ? 1 : 0) + (p.whatsapp ? 1 : 0);
      await enriquecerUno(p, timeoutMs, signal);
      const despues = (p.email ? 1 : 0) + (p.whatsapp ? 1 : 0);
      if (despues > antes) enriquecidos++;
    }
  }

  const n = Math.min(concurrencia, objetivos.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return enriquecidos;
}
