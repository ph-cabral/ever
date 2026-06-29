// Carga única de los 329 casos históricos (casos_sistema.xlsx) al schema "sistema".
// Requiere haber corrido antes sql/sistema_init.sql y `prisma generate`.
// Uso: node scripts/seed-sistema.mjs

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const data = JSON.parse(
  readFileSync(path.join(__dirname, "seed-sistema-data.json"), "utf-8")
);

// softech: estado del excel -> nombre de columna del tablero softech
const ESTADO_A_COLUMNA = {
  "Solucionado": "Solucionado",
  "Arreglado/Sin solucionar": "Parcial / sin solución",
  "En espera": "En espera",
  "Sin Solucion": "Sin solución",
};
const ESTADO_DEFAULT = "Pendiente";

async function getColumnaMap(clave) {
  const tablero = await prisma.sistema_tablero.findUnique({ where: { clave } });
  if (!tablero) throw new Error(`Tablero "${clave}" no existe — correr sql/sistema_init.sql primero`);
  const columnas = await prisma.sistema_columna.findMany({ where: { tableroId: tablero.id } });
  const map = {};
  for (const c of columnas) map[c.nombre] = c.id;
  return map;
}

async function seedSoftech() {
  const cols = await getColumnaMap("softech");
  const rows = data.softech ?? [];
  let orden = {};
  for (const r of rows) {
    const colNombre = ESTADO_A_COLUMNA[r.estado] ?? ESTADO_DEFAULT;
    const columnaId = cols[colNombre];
    if (!columnaId) throw new Error(`Columna "${colNombre}" no encontrada en softech`);
    orden[columnaId] = (orden[columnaId] ?? -1) + 1;
    await prisma.sistema_tarjeta.create({
      data: {
        columnaId,
        orden: orden[columnaId],
        campos: {
          inicio: r.inicio ?? null,
          problema: r.problema ?? null,
          sistema: r.sistema ?? null,
          fin: r.fin ?? null,
          origen: r.origen ?? null,
          accion: r.accion ?? null,
        },
      },
    });
  }
  console.log(`softech: ${rows.length} tarjetas creadas`);
}

async function seedSistema() {
  const cols = await getColumnaMap("sistema");
  const columnaId = cols["Resuelto"];
  if (!columnaId) throw new Error(`Columna "Resuelto" no encontrada en sistema`);
  const rows = data.sistema ?? [];
  let orden = -1;
  for (const r of rows) {
    orden++;
    await prisma.sistema_tarjeta.create({
      data: {
        columnaId,
        orden,
        campos: {
          fecha: r.fecha ?? null,
          problema: r.problema ?? null,
          solucion: r.solucion ?? null,
          ubicacion: r.ubicacion ?? null,
          categoria: r.categoria ?? null,
        },
      },
    });
  }
  console.log(`sistema: ${rows.length} tarjetas creadas`);
}

async function seedBuren() {
  const cols = await getColumnaMap("buren");
  const columnaId = cols["Incidentes registrados"];
  if (!columnaId) throw new Error(`Columna "Incidentes registrados" no encontrada en buren`);
  const rows = data.buren ?? [];
  let orden = -1;
  for (const r of rows) {
    orden++;
    await prisma.sistema_tarjeta.create({
      data: {
        columnaId,
        orden,
        campos: {
          fecha: r.fecha ?? null,
          ubicacion: r.ubicacion ?? null,
          problema: r.problema ?? null,
          tiempo: r.tiempo ?? null,
        },
      },
    });
  }
  console.log(`buren: ${rows.length} tarjetas creadas`);
}

async function main() {
  const existentes = await prisma.sistema_tarjeta.count();
  if (existentes > 0) {
    console.log(`Ya hay ${existentes} tarjetas en sistema.sistema_tarjeta — abortando para no duplicar.`);
    console.log(`Si querés recargar: TRUNCATE sistema.sistema_tarjeta RESTART IDENTITY; y volvé a correr este script.`);
    return;
  }
  await seedSoftech();
  await seedSistema();
  await seedBuren();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
