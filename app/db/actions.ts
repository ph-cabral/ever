"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type Field = {
  name: string;
  type: string;
  kind: string;
  isId: boolean;
  isList: boolean;
  required: boolean;
  hasDefault: boolean;
};
export type Model = { name: string; fields: Field[] };

function rawModels() {
  return (prisma as any)._runtimeDataModel.models as Record<string, any>;
}

function modelDefs(): Model[] {
  return Object.entries(rawModels()).map(([name, def]) => ({
    name,
    fields: def.fields
      .filter((f: any) => f.kind !== "object")
      .map(
        (f: any): Field => ({
          name: f.name,
          type: f.type,
          kind: f.kind,
          isId: f.isId,
          isList: f.isList,
          required:
            f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt && !f.isId,
          hasDefault: f.hasDefaultValue || f.isUpdatedAt,
        }),
      ),
  }));
}

export async function listModels() {
  return modelDefs();
}

function bigintReplacer(_: string, v: any) {
  return typeof v === "bigint" ? v.toString() : v;
}
const json = (x: any) => JSON.parse(JSON.stringify(x, bigintReplacer));

function coerce(f: Field, raw: any) {
  if (raw === "" || raw == null) return null;
  if (f.isList)
    return Array.isArray(raw)
      ? raw
      : String(raw)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  switch (f.type) {
    case "Int":
      return parseInt(raw, 10);
    case "BigInt":
      return BigInt(raw);
    case "Float":
    case "Decimal":
      return parseFloat(raw);
    case "Boolean":
      return raw === true || raw === "true";
    case "DateTime":
      return new Date(raw);
    case "Json":
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    default:
      return raw;
  }
}

function def(model: string) {
  const d = modelDefs().find((m) => m.name === model);
  if (!d) throw new Error(`Modelo desconocido: ${model}`);
  return d;
}
function idField(d: Model) {
  return d.fields.find((f) => f.isId)!;
}

// ── filtros: { field, op, value }[] ──
type Filter = { field: string; op: string; value: string };
function buildWhere(d: Model, filters: Filter[]) {
  const where: any = {};
  for (const flt of filters) {
    const f = d.fields.find((x) => x.name === flt.field);
    if (!f || flt.value === "") continue;
    const isText = ["String"].includes(f.type) && !f.isList;
    let cond: any;
    switch (flt.op) {
      case "contains":
        cond = { contains: flt.value, mode: "insensitive" };
        break;
      case "equals":
        cond = { equals: coerce(f, flt.value) };
        break;
      case "gt":
        cond = { gt: coerce(f, flt.value) };
        break;
      case "gte":
        cond = { gte: coerce(f, flt.value) };
        break;
      case "lt":
        cond = { lt: coerce(f, flt.value) };
        break;
      case "lte":
        cond = { lte: coerce(f, flt.value) };
        break;
      case "not":
        cond = { not: coerce(f, flt.value) };
        break;
      default:
        cond = isText
          ? { contains: flt.value, mode: "insensitive" }
          : { equals: coerce(f, flt.value) };
    }
    where[flt.field] = cond;
  }
  return where;
}

export async function listRows(
  model: string,
  opts: { skip?: number; take?: number; filters?: Filter[] } = {},
) {
  const d = def(model);
  const { skip = 0, take = 50, filters = [] } = opts;
  const where = buildWhere(d, filters);
  const client = (prisma as any)[model];
  const id = idField(d).name;
  const [rows, total] = await Promise.all([
    client.findMany({ where, skip, take, orderBy: { [id]: "asc" } }),
    client.count({ where }),
  ]);
  return { rows: json(rows), total };
}

export async function updateRow(
  model: string,
  id: any,
  data: Record<string, any>,
) {
  const d = def(model);
  const idf = idField(d);
  const out: any = {};
  for (const [k, v] of Object.entries(data)) {
    const f = d.fields.find((x) => x.name === k);
    if (!f || f.isId) continue;
    out[k] = coerce(f, v);
  }
  await (prisma as any)[model].update({
    where: { [idf.name]: coerce(idf, id) },
    data: out,
  });
  revalidatePath("/db");
}

export async function createRow(model: string, data: Record<string, any>) {
  const d = def(model);
  const out: any = {};
  for (const f of d.fields) {
    if (f.isId && f.hasDefault) continue;
    const raw = data[f.name];
    if ((raw === "" || raw == null) && f.hasDefault) continue;
    if ((raw === "" || raw == null) && !f.required) continue;
    out[f.name] = coerce(f, raw);
  }
  const created = await (prisma as any)[model].create({ data: out });
  revalidatePath("/db");
  return json(created);
}

export async function deleteRow(model: string, id: any) {
  const d = def(model);
  const idf = idField(d);
  await (prisma as any)[model].delete({
    where: { [idf.name]: coerce(idf, id) },
  });
  revalidatePath("/db");
}
