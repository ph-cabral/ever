// Catálogo de módulos de la app + mapeo ruta -> módulo + defaults por sector.
// IMPORTANTE: este archivo NO debe importar nada de Node ("crypto", "fs", prisma, etc.)
// porque también lo usa el middleware, que corre en el runtime edge.

export type ModuleKey =
  | "manguera"
  | "deposito"
  | "picking"
  | "finanza"
  | "rrhh"
  | "indicadores"
  | "sorteo"
  | "vicki"
  | "buscador";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  href: string;
  color: string; // clases tailwind para el botón del home
}

export const MODULES: ModuleDef[] = [
  { key: "manguera",    label: "Mangueras",   href: "/manguera",    color: "bg-orange-600 hover:bg-orange-500" },
  { key: "deposito",    label: "Depósito",    href: "/deposito",    color: "bg-emerald-700 hover:bg-emerald-600" },
  { key: "picking",     label: "Picking",     href: "/picking",     color: "bg-purple-700 hover:bg-purple-600" },
  { key: "finanza",     label: "Finanzas",    href: "/finanza",     color: "bg-teal-700 hover:bg-teal-600" },
  { key: "rrhh",        label: "RRHH",        href: "/rrhh",        color: "bg-indigo-700 hover:bg-indigo-600" },
  { key: "indicadores", label: "Indicadores", href: "/indicadores", color: "bg-blue-700 hover:bg-blue-600" },
  { key: "sorteo",      label: "Sorteo",      href: "/sorteo",      color: "bg-pink-700 hover:bg-pink-600" },
  { key: "vicki",       label: "Vicki",       href: "/vicki",       color: "bg-slate-700 hover:bg-slate-600" },
  { key: "buscador",    label: "Buscador",    href: "/buscador",    color: "bg-cyan-700 hover:bg-cyan-600" },
];

export const ALL_MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && (ALL_MODULE_KEYS as string[]).includes(v);
}

export function moduleLabel(key: ModuleKey): string {
  return MODULES.find((m) => m.key === key)?.label ?? key;
}

// Payload que viaja firmado en la cookie de sesión.
export interface SessionPayload {
  uid: number; // usuario.id
  dni: string;
  nombre: string;
  rol: "ADMIN" | "USUARIO";
  mods: ModuleKey[]; // módulos habilitados, resueltos al iniciar sesión
  iat: number; // epoch (segundos)
  exp: number; // epoch (segundos)
}

// Prefijo de ruta -> módulo. Cubre la página y su API (/api/<mod>).
const ROUTE_MODULE: { prefix: string; mod: ModuleKey }[] = [
  { prefix: "/manguera",        mod: "manguera" },
  { prefix: "/api/manguera",    mod: "manguera" },
  { prefix: "/api/reportes",    mod: "manguera" }, // ranking de cortes
  { prefix: "/deposito",        mod: "deposito" },
  { prefix: "/api/deposito",    mod: "deposito" },
  { prefix: "/picking",         mod: "picking" },
  { prefix: "/api/picking",     mod: "picking" },
  { prefix: "/finanza",         mod: "finanza" },
  { prefix: "/api/finanza",     mod: "finanza" },
  { prefix: "/rrhh",            mod: "rrhh" },
  { prefix: "/api/rrhh",        mod: "rrhh" },
  { prefix: "/api/foto",        mod: "rrhh" },
  { prefix: "/indicadores",     mod: "indicadores" },
  { prefix: "/api/indicadores", mod: "indicadores" },
  { prefix: "/sorteo",          mod: "sorteo" },
  { prefix: "/api/sorteo",      mod: "sorteo" },
  { prefix: "/vicki",           mod: "vicki" },
  { prefix: "/api/vicki",       mod: "vicki" },
  { prefix: "/buscador",        mod: "buscador" },
  { prefix: "/api/buscador",    mod: "buscador" },
];

/** Módulo requerido por una ruta, o null si no exige un módulo en particular. */
export function moduleForPath(pathname: string): ModuleKey | null {
  for (const r of ROUTE_MODULE) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) return r.mod;
  }
  return null;
}

/** Rutas exclusivas de admin (rol ADMIN), además de cualquier /admin/*. */
export function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/db" || pathname.startsWith("/db/") ||
    pathname === "/admin" || pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/db")
  );
}

// Módulos sugeridos por sector. Se ofrecen como default editable la primera vez;
// el admin los ajusta en /admin/permisos. La clave se compara en minúsculas.
export const DEFAULT_SECTOR_MODULOS: Record<string, ModuleKey[]> = {
  "deposito":          ["deposito", "picking"],
  "depósito":          ["deposito", "picking"],
  "logistica":         ["deposito", "picking"],
  "logística":         ["deposito", "picking"],
  "fabrica":           ["manguera"],
  "fábrica":           ["manguera"],
  "produccion":        ["manguera"],
  "producción":        ["manguera"],
  "rrhh":              ["rrhh"],
  "recursos humanos":  ["rrhh"],
  "administracion":    ["finanza", "indicadores", "rrhh", "buscador"],
  "administración":    ["finanza", "indicadores", "rrhh", "buscador"],
  "finanzas":          ["finanza", "indicadores"],
  "comercial":         ["buscador"],
  "ventas":            ["buscador"],
  "gerencia":          ALL_MODULE_KEYS,
  "direccion":         ALL_MODULE_KEYS,
  "dirección":         ALL_MODULE_KEYS,
};

export function defaultModulosForSector(sector?: string | null): ModuleKey[] {
  if (!sector) return [];
  return DEFAULT_SECTOR_MODULOS[sector.trim().toLowerCase()] ?? [];
}
