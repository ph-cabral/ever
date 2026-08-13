// Tipos y helpers compartidos por los tableros de tareas de RRHH y Calidad
// (components/tareas/TareasBoard.tsx). Duplican el patrón visual/funcional del
// tablero de /sistema (app/sistema/SistemaClient.tsx) pero simplificado: un solo
// tablero por área (sin tabs de múltiples tableros, sin vinculación entre
// tableros, sin integraciones tipo Softech/Jira) y con datos 100% propios — ver
// lib/tareas/server.ts y sql/rrhh_tareas.sql / sql/calidad_tareas.sql.

export type Campos = Record<string, string | null>;

export type Tarjeta = {
  id: number;
  columnaId: number;
  orden: number;
  campos: Campos;
  // Fecha/hora en que entró a columnaId actual (se actualiza al cambiar de
  // columna). No confundir con createdAt (fecha de alta original).
  columnaDesde?: string;
  createdAt?: string;
};

export type Columna = {
  id: number;
  nombre: string;
  orden: number;
  tarjetas: Tarjeta[];
};

export type CriterioOrden = "POSICION" | "CREACION" | "IMPORTANCIA";

export type TareasConfig = {
  clave: string;
  criterioOrden: CriterioOrden;
};

export type TableroData = {
  columnas: Columna[];
  config: TareasConfig;
};

export type CampoDef = {
  k: string;
  l: string;
  t: "text" | "textarea" | "date" | "select";
  opciones?: string[];
  auto?: boolean;
};

// Campos de la tarjeta: iguales para RRHH y Calidad (no fue pedido que
// difieran entre áreas). titleKey = campo usado como título de la tarjeta.
// "importancia" existe para que el criterio de orden IMPORTANCIA tenga de
// qué agarrarse.
export const SCHEMA_TAREA: { titleKey: string; fields: CampoDef[] } = {
  titleKey: "descripcion",
  fields: [
    { k: "fecha", l: "Fecha de alta", t: "date", auto: true },
    { k: "descripcion", l: "Tarea", t: "textarea" },
    { k: "responsable", l: "Responsable", t: "text" },
    { k: "importancia", l: "Importancia", t: "select", opciones: ["Alta", "Media", "Baja"] },
  ],
};

export function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const IMPORTANCIA_PESO: Record<string, number> = { Alta: 0, Media: 1, Baja: 2 };
function pesoImportancia(v: string | null | undefined): number {
  return v && v in IMPORTANCIA_PESO ? IMPORTANCIA_PESO[v] : 99;
}

export async function apiJson(url: string, opts?: RequestInit) {
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// Orden efectivo de las tarjetas de una columna, según config.criterioOrden:
// - POSICION: respeta el campo `orden` (drag&drop manual, ver TareasBoard).
// - CREACION: por fecha de alta (campos.fecha, o createdAt si no hay), más
//   antigua primero.
// - IMPORTANCIA: Alta > Media > Baja; empate se resuelve por `orden`.
export function ordenarTarjetas(tarjetas: Tarjeta[], criterio: CriterioOrden): Tarjeta[] {
  if (criterio === "CREACION") {
    return [...tarjetas].sort((a, b) => {
      const da = parseDate(a.campos.fecha ?? a.createdAt)?.getTime() ?? 0;
      const db = parseDate(b.campos.fecha ?? b.createdAt)?.getTime() ?? 0;
      return da - db;
    });
  }
  if (criterio === "IMPORTANCIA") {
    return [...tarjetas].sort((a, b) => {
      const pa = pesoImportancia(a.campos.importancia);
      const pb = pesoImportancia(b.campos.importancia);
      return pa !== pb ? pa - pb : a.orden - b.orden;
    });
  }
  return [...tarjetas].sort((a, b) => a.orden - b.orden);
}
