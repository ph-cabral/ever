// Genera lib/auth/nav.generated.ts escaneando app/ en busca de page.tsx.
// Corre en build (Node), NO en edge. modules.ts sólo importa el resultado (datos planos).
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "app");

// Módulos de primer nivel que son "apps" del home.
const MODULE_KEYS = ["manguera","deposito","picking","compras","ventas","finanza","rrhh","sorteo","vicki","buscador","sistema"];

// Rutas accesibles pero que NO se listan en el árbol (home/permisos).
const IGNORE = new Set(["/deposito/faltantes/control"]);

// Etiquetas lindas por segmento (acentos, siglas). Lo que no esté acá va Capitalizado.
const LABELS = {
  wms:"WMS", rrhh:"RRHH", evaluacion:"Evaluación", duplicadas:"Duplicadas",
  faltantes:"Faltantes", pedidos:"Pedidos", stock:"Stock", corte:"Corte",
  picker:"Picker", armar:"Armar", dashboard:"Dashboard", asistencia:"Asistencia",
  legajos:"Legajos", relojes:"Relojes",
};
const label = (seg) => LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);

const hasPage = (dir) => ["page.tsx","page.jsx","page.ts"].some((f) => {
  try { return statSync(join(dir, f)).isFile(); } catch { return false; }
});
const subdirs = (dir) => {
  let e = []; try { e = readdirSync(dir); } catch { return []; }
  return e
    .filter((n) => !(n.startsWith("[") || n.startsWith("(") || n.startsWith("_") ||
                     ["api","components","nuevo","editar"].includes(n)))
    .filter((n) => { try { return statSync(join(dir, n)).isDirectory(); } catch { return false; } })
    .sort();
};

// Construye NavNode[] recursivo para las SUB-rutas de una carpeta.
function walk(dir, href) {
  const out = [];
  for (const seg of subdirs(dir)) {
    const childDir = join(dir, seg);
    const childHref = `${href}/${seg}`;
    if (!hasPage(childDir)) { out.push(...walk(childDir, childHref)); continue; } // carpeta sin page: aplanar hijos
    if (IGNORE.has(childHref)) continue;
    const node = { label: label(seg), href: childHref };
    const kids = walk(childDir, childHref);
    if (kids.length) node.children = kids;
    out.push(node);
  }
  return out;
}

const GEN = {};
for (const key of MODULE_KEYS) GEN[key] = walk(join(APP, key), `/${key}`);

const banner = "// AUTO-GENERADO por scripts/gen-nav.mjs — NO editar a mano.\n" +
  "// Se regenera en cada dev/build. Escanea app/**/page.tsx.\n";
const body = `import type { NavNode } from "./modules";\n\n` +
  `export const GENERATED_CHILDREN: Record<string, NavNode[]> = ${JSON.stringify(GEN, null, 2)};\n`;
writeFileSync(join(ROOT, "lib/auth/nav.generated.ts"), banner + body);
console.log("nav.generated.ts OK");
