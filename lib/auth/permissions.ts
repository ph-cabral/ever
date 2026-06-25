// Resolución de módulos habilitados por sector (lee everwear.sector_permiso).
// Runtime Node (usa prisma). El resultado se "hornea" en la cookie al loguear.
import { prisma } from "@/lib/prisma";
import {
  ALL_MODULE_KEYS,
  defaultModulosForSector,
  isModuleKey,
  type ModuleKey,
} from "./modules";

function sanitize(v: unknown): ModuleKey[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isModuleKey);
}

/**
 * Módulos habilitados para un sector.
 * - Si hay fila en sector_permiso, manda esa configuración.
 * - Si no, cae al default sugerido (no se persiste hasta que el admin guarde).
 */
export async function modulosForSector(sector?: string | null): Promise<ModuleKey[]> {
  if (!sector) return [];
  const row = await prisma.sector_permiso.findUnique({ where: { sector } });
  if (row) return sanitize(row.modulos);
  return defaultModulosForSector(sector);
}

/** Módulos efectivos de un usuario: ADMIN ve todo; el resto, por su sector. */
export async function modulosForUsuario(opts: {
  rol: string;
  sector?: string | null;
}): Promise<ModuleKey[]> {
  if (opts.rol === "ADMIN") return [...ALL_MODULE_KEYS];
  return modulosForSector(opts.sector);
}
