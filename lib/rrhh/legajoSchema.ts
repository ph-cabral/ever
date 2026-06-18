// lib/rrhh/legajoSchema.ts
// Schema Zod derivado de la metadata de legajoFields. Lo usan el editor (RHF) y la API (PUT).
import { z } from "zod";
import { ALL_FIELDS, RELATIONS, type FieldDef } from "./legajoFields";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

function zField(f: FieldDef): z.ZodTypeAny {
  switch (f.type) {
    case "text":
    case "textarea":
    case "select": {
      let s = z.string();
      if (f.max) s = s.max(f.max, `Máximo ${f.max} caracteres`);
      return f.required ? s.min(1, "Requerido") : z.preprocess(emptyToNull, s.nullable());
    }
    case "number":
      return f.required
        ? z.coerce.number({ invalid_type_error: "Número inválido" })
        : z.preprocess(emptyToNull, z.coerce.number().nullable());
    case "int":
      return f.required
        ? z.coerce.number().int()
        : z.preprocess(emptyToNull, z.coerce.number().int().nullable());
    case "date":
      return f.required
        ? z.string().min(1, "Requerido")
        : z.preprocess(emptyToNull, z.string().nullable());
    case "bool":
      return z.coerce.boolean();
  }
}

const scalarShape: Record<string, z.ZodTypeAny> = {};
for (const f of ALL_FIELDS) scalarShape[f.name] = zField(f);

function zRow(cols: FieldDef[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const c of cols) shape[c.name] = zField(c);
  shape.id = z.preprocess(emptyToNull, z.coerce.number().int().nullable());
  return z.object(shape);
}

const relationShape: Record<string, z.ZodTypeAny> = {};
for (const r of RELATIONS) relationShape[r.key] = z.array(zRow(r.columns)).default([]);

export const legajoUpdateSchema = z.object({ ...scalarShape, ...relationShape });
export type LegajoUpdateInput = z.infer<typeof legajoUpdateSchema>;

// Nombres de campos por tipo (para normalizar en la API)
export const SCALAR_DATE_FIELDS = ALL_FIELDS.filter((f) => f.type === "date").map((f) => f.name);
export const SCALAR_NUMBER_FIELDS = ALL_FIELDS.filter((f) => f.type === "number" || f.type === "int").map((f) => f.name);
export const SCALAR_NAMES = ALL_FIELDS.map((f) => f.name);
