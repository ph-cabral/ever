// lib/rrhh/legajoService.ts  (server-only)
// Carga y guardado del legajo completo (escalares + relaciones).
import "server-only";
import { prisma } from "@/lib/prisma";
import { RELATIONS, type FieldDef } from "./legajoFields";
import { SCALAR_NAMES, SCALAR_DATE_FIELDS, type LegajoUpdateInput } from "./legajoSchema";

// include de todas las relaciones editables
const RELATION_INCLUDE = {
  familiares: true,
  beneficiarios: true,
  estudios: true,
  idiomas: true,
  equipos: true,
  antecedentesSrt: true,
} as const;

const toDateInput = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const toDateOrNull = (v: unknown) => (v ? new Date(`${v}T00:00:00`) : null);

// Normaliza una fila de relación según su metadata (fechas/números/bool)
function normalizeRow(cols: FieldDef[], row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const c of cols) {
    const v = row[c.name];
    if (c.type === "date") out[c.name] = toDateOrNull(v);
    else if (c.type === "number") out[c.name] = v === "" || v == null ? null : Number(v);
    else if (c.type === "int") out[c.name] = v === "" || v == null ? null : parseInt(String(v), 10);
    else if (c.type === "bool") out[c.name] = Boolean(v);
    else out[c.name] = v === "" ? null : v ?? null;
  }
  return out;
}

export type LegajoFormValues = Record<string, unknown>;

export async function getLegajoFormValues(id: number): Promise<LegajoFormValues | null> {
  const l = await prisma.legajo.findUnique({
    where: { id },
    include: { ...RELATION_INCLUDE, sectorRel: true, personal: true },
  });
  if (!l) return null;

  const v: LegajoFormValues = {};
  // escalares
  for (const name of SCALAR_NAMES) {
    const raw = (l as Record<string, unknown>)[name];
    v[name] = SCALAR_DATE_FIELDS.includes(name)
      ? toDateInput(raw as Date | null)
      : raw ?? (typeof raw === "boolean" ? raw : "");
  }
  // bools que pudieran venir null -> false
  for (const name of SCALAR_NAMES) if (typeof v[name] === "object" && v[name] === null) v[name] = "";

  // relaciones
  for (const r of RELATIONS) {
    const rows = ((l as Record<string, unknown>)[r.key] as Record<string, unknown>[]) ?? [];
    v[r.key] = rows.map((row) => {
      const o: Record<string, unknown> = { id: row.id };
      for (const c of r.columns) {
        const raw = row[c.name];
        o[c.name] = c.type === "date" ? toDateInput(raw as Date | null) : raw ?? (c.type === "bool" ? false : "");
      }
      return o;
    });
  }

  // metadatos read-only para cabecera
  v._id = l.id;
  v._dni = l.dni ?? "";
  v._sectorNombre = l.sectorRel?.nombre ?? "";
  return v;
}

export async function updateLegajo(id: number, data: LegajoUpdateInput) {
  // escalares
  const scalarData: Record<string, unknown> = {};
  for (const name of SCALAR_NAMES) {
    const v = (data as Record<string, unknown>)[name];
    scalarData[name] = SCALAR_DATE_FIELDS.includes(name) ? toDateOrNull(v) : v;
  }

  await prisma.$transaction(async (tx) => {
    await (tx as any).legajo.update({ where: { id }, data: scalarData });
    for (const r of RELATIONS) {
      const rows = ((data as Record<string, unknown>)[r.key] as Record<string, unknown>[]) ?? [];
      const delegate = (tx as any)[delegateName(r.key)];
      await delegate.deleteMany({ where: { legajoId: id } });
      if (rows.length) {
        await delegate.createMany({
          data: rows.map((row) => ({ ...normalizeRow(r.columns, row), legajoId: id })),
        });
      }
    }
  });
}

// key de relación -> nombre del modelo prisma
function delegateName(key: string): string {
  return (
    {
      familiares: "legajo_familiar",
      beneficiarios: "legajo_beneficiario",
      estudios: "legajo_estudio",
      idiomas: "legajo_idioma",
      equipos: "legajo_equipo",
      antecedentesSrt: "legajo_antecedente_srt",
    } as Record<string, string>
  )[key];
}
