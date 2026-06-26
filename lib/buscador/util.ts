// Utilidades compartidas por las fuentes y la API del buscador.
import { normalizar } from "./provincias";

export function soloDigitos(s?: string | null): string {
  return (s ?? "").replace(/\D+/g, "");
}

/** Hostname sin "www." en minúsculas, o null si no es una URL válida. */
export function dominio(url?: string | null): string | null {
  if (!url) return null;
  const raw = url.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Clave de deduplicación. Prioriza, en orden:
 *  1) dominio de la web,
 *  2) últimos 10 dígitos del teléfono,
 *  3) nombre normalizado + provincia.
 */
export function claveDedupe(o: {
  web?: string | null;
  telefono?: string | null;
  nombre?: string | null;
  provincia?: string | null;
}): string {
  const dom = dominio(o.web);
  if (dom) return `w:${dom}`;
  const tel = soloDigitos(o.telefono);
  if (tel.length >= 8) return `t:${tel.slice(-10)}`;
  const n = normalizar(o.nombre ?? "").replace(/[^a-z0-9]+/g, " ").trim();
  return `n:${n}|${normalizar(o.provincia ?? "")}`;
}
