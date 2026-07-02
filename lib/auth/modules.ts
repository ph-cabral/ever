// Catálogo de módulos de la app + mapeo ruta -> módulo + defaults por sector.
// IMPORTANTE: este archivo NO debe importar nada de Node ("crypto", "fs", prisma, etc.)
// porque también lo usa el middleware, que corre en el runtime edge.

export type ModuleKey =
  | "manguera"
  | "deposito"
  | "picking"
  | "compras"
  | "ventas"
  | "finanza"
  | "rrhh"
  | "sorteo"
  | "vicki"
  | "buscador"
  | "sistema";

// Nodo de navegación (recursivo): una vista puede tener sub-vistas.
export interface NavNode {
  label: string;
  href: string;
  children?: NavNode[];
}

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  href: string;
  color: string; // clases tailwind para el botón del home
  children?: NavNode[]; // sub-vistas (árbol) para el menú animado del home
}

export const MODULES: ModuleDef[] = [
  { key: "manguera",    label: "Mangueras",   href: "/manguera",    color: "bg-orange-600 hover:bg-orange-500",
    children: [{ label: "Corte", href: "/manguera/corte" }] },
  { key: "deposito",    label: "Depósito",    href: "/deposito",    color: "bg-emerald-700 hover:bg-emerald-600",
    children: [
      { label: "Evaluación", href: "/deposito/evaluacion" },
      { label: "Faltantes",  href: "/deposito/faltantes" },
      { label: "Duplicadas", href: "/deposito/faltantes/duplicadas" },
      { label: "Pedidos",    href: "/deposito/pedidos" },
      { label: "WMS",        href: "/deposito/wms" },
    ] },
  { key: "picking",     label: "Picking",     href: "/picking",     color: "bg-purple-700 hover:bg-purple-600",
    children: [{ label: "Picker", href: "/picking/picker" }] },
  { key: "compras",     label: "Compras",     href: "/compras",     color: "bg-amber-700 hover:bg-amber-600",
    children: [{ label: "Faltantes", href: "/compras/faltantes" }] },
  { key: "ventas",      label: "Ventas",      href: "/ventas",      color: "bg-red-700 hover:bg-red-600",
    children: [{ label: "Faltantes", href: "/ventas/faltantes" }] },
  { key: "finanza",     label: "Finanzas",    href: "/finanza",     color: "bg-teal-700 hover:bg-teal-600" },
  { key: "rrhh",        label: "RRHH",        href: "/rrhh",        color: "bg-indigo-700 hover:bg-indigo-600",
    children: [
      { label: "Dashboard",  href: "/rrhh/dashboard" },
      { label: "Asistencia", href: "/rrhh/asistencia" },
      { label: "Legajos",    href: "/rrhh/legajos" },
      { label: "Relojes",    href: "/rrhh/relojes" },
    ] },
  { key: "sorteo",      label: "Sorteo",      href: "/sorteo",      color: "bg-pink-700 hover:bg-pink-600",
    children: [{ label: "Armar", href: "/sorteo/armar" }] },
  { key: "vicki",       label: "Vicki",       href: "/vicki",       color: "bg-slate-700 hover:bg-slate-600" },
  { key: "buscador",    label: "Buscador",    href: "/buscador",    color: "bg-cyan-700 hover:bg-cyan-600" },
  { key: "sistema",     label: "Sistema",     href: "/sistema",     color: "bg-rose-700 hover:bg-rose-600" },
];

export const ALL_MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

// ----- Vistas (sub-rutas) de cada módulo, para permisos finos -----
export interface ViewRef {
  mod: ModuleKey;
  label: string;
  href: string;
}

function flattenNodes(mod: ModuleKey, nodes: NavNode[] | undefined): ViewRef[] {
  if (!nodes) return [];
  return nodes.flatMap((n) => [
    { mod, label: n.label, href: n.href },
    ...flattenNodes(mod, n.children),
  ]);
}

export const VIEWS: ViewRef[] = MODULES.flatMap((m) => flattenNodes(m.key, m.children));

export const ALL_VIEW_HREFS: string[] = VIEWS.map((v) => v.href);

export function viewsForModule(key: ModuleKey): ViewRef[] {
  return VIEWS.filter((v) => v.mod === key);
}

/** Vista (sub-ruta) más específica a la que pertenece un pathname, o null. */
export function viewForPath(pathname: string): ViewRef | null {
  let best: ViewRef | null = null;
  for (const v of VIEWS) {
    if (pathname === v.href || pathname.startsWith(v.href + "/")) {
      if (!best || v.href.length > best.href.length) best = v;
    }
  }
  return best;
}

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && (ALL_MODULE_KEYS as string[]).includes(v);
}

export function isViewHref(v: unknown): v is string {
  return typeof v === "string" && ALL_VIEW_HREFS.includes(v);
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
  vistas?: string[]; // hrefs de sub-vistas permitidas (cookies viejas no la traen)
  ocultos?: string[]; // keys de módulo / hrefs de vista ocultos del inicio (tienen acceso)
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
  { prefix: "/compras",         mod: "compras" },
  { prefix: "/api/compras",     mod: "compras" },
  { prefix: "/ventas",          mod: "ventas" },
  { prefix: "/api/ventas",      mod: "ventas" },
  { prefix: "/finanza",         mod: "finanza" },
  { prefix: "/api/finanza",     mod: "finanza" },
  { prefix: "/rrhh",            mod: "rrhh" },
  { prefix: "/api/rrhh",        mod: "rrhh" },
  { prefix: "/api/foto",        mod: "rrhh" },
  { prefix: "/sorteo",          mod: "sorteo" },
  { prefix: "/api/sorteo",      mod: "sorteo" },
  { prefix: "/vicki",           mod: "vicki" },
  { prefix: "/api/vicki",       mod: "vicki" },
  { prefix: "/buscador",        mod: "buscador" },
  { prefix: "/api/buscador",    mod: "buscador" },
  { prefix: "/sistema",         mod: "sistema" },
  { prefix: "/api/sistema",     mod: "sistema" },
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
  "administracion":    ["finanza", "rrhh", "buscador"],
  "administración":    ["finanza", "rrhh", "buscador"],
  "sistemas":          ["sistema"],
  "soporte":           ["sistema"],
  "finanzas":          ["finanza"],
  "comercial":         ["buscador"],
  "ventas":            ["buscador", "ventas"],
  "gerencia":          ALL_MODULE_KEYS,
  "direccion":         ALL_MODULE_KEYS,
  "dirección":         ALL_MODULE_KEYS,
};

export function defaultModulosForSector(sector?: string | null): ModuleKey[] {
  if (!sector) return [];
  return DEFAULT_SECTOR_MODULOS[sector.trim().toLowerCase()] ?? [];
}
