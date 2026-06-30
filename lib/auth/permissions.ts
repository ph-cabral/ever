// Resolución de permisos por sector (lee everwear.sector_permiso).
// Runtime Node (usa prisma). El resultado se "hornea" en la cookie al loguear.
import { prisma } from "@/lib/prisma";
import {
  ALL_MODULE_KEYS,
  ALL_VIEW_HREFS,
  defaultModulosForSector,
  isModuleKey,
  isViewHref,
  viewsForModule,
  type ModuleKey,
} from "./modules";

function sanitizeMods(v: unknown): ModuleKey[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isModuleKey);
}

function sanitizeHrefs(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isViewHref);
}

// Para "ocultos" admitimos tanto keys de módulo como hrefs de vista.
function sanitizeOcultos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => isModuleKey(x) || isViewHref(x));
}

export interface PermisosSector {
  mods: ModuleKey[];
  vistas: string[]; // hrefs de sub-vistas permitidas
  ocultos: string[]; // keys/hrefs ocultos del inicio (con acceso)
}

/** Todas las vistas de los módulos habilitados (default cuando no hay selección guardada). */
function allViewsForMods(mods: ModuleKey[]): string[] {
  return mods.flatMap((m) => viewsForModule(m).map((v) => v.href));
}

/**
 * Permisos de un sector.
 * - Si hay fila en sector_permiso, manda esa configuración.
 *   - vistas vacías ⇒ "todas las vistas de los módulos habilitados"
 *     (compatibilidad con filas previas a permisos finos).
 * - Si no hay fila, cae al default sugerido (no se persiste hasta que el admin guarde).
 */
export async function permisosForSector(sector?: string | null): Promise<PermisosSector> {
  if (!sector) return { mods: [], vistas: [], ocultos: [] };
  const row = await prisma.sector_permiso.findUnique({ where: { sector } });
  if (!row) {
    const mods = defaultModulosForSector(sector);
    return { mods, vistas: allViewsForMods(mods), ocultos: [] };
  }
  const mods = sanitizeMods(row.modulos as unknown);
  const storedVistas = sanitizeHrefs((row as any).vistas);
  const vistas = storedVistas.length ? storedVistas : allViewsForMods(mods);
  const ocultos = sanitizeOcultos((row as any).ocultos);
  return { mods, vistas, ocultos };
}

/** Permisos efectivos de un usuario: ADMIN ve todo; el resto, por su sector. */
export async function permisosForUsuario(opts: {
  rol: string;
  sector?: string | null;
}): Promise<PermisosSector> {
  if (opts.rol === "ADMIN") {
    return { mods: [...ALL_MODULE_KEYS], vistas: [...ALL_VIEW_HREFS], ocultos: [] };
  }
  return permisosForSector(opts.sector);
}

// --- Compat: helpers viejos que devuelven solo los módulos ---
export async function modulosForSector(sector?: string | null): Promise<ModuleKey[]> {
  return (await permisosForSector(sector)).mods;
}

export async function modulosForUsuario(opts: {
  rol: string;
  sector?: string | null;
}): Promise<ModuleKey[]> {
  return (await permisosForUsuario(opts)).mods;
}
