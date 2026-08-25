"use client";
import { useState, useTransition, useCallback } from "react";
import {
  listRows,
  updateRow,
  createRow,
  deleteRow,
  type Model,
  type Field,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { InicioButton } from "@/components/ui/InicioButton";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

type Filter = { field: string; op: string; value: string };
const TEXT_OPS = [
  ["contains", "contiene"],
  ["equals", "="],
  ["not", "≠"],
];
const NUM_OPS = [
  ["equals", "="],
  ["gt", ">"],
  ["gte", "≥"],
  ["lt", "<"],
  ["lte", "≤"],
  ["not", "≠"],
];
const isNumeric = (t: string) =>
  ["Int", "BigInt", "Float", "Decimal", "DateTime"].includes(t);

export default function DbAdmin({ models }: { models: Model[] }) {
  const [active, setActive] = useState<Model | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [edit, setEdit] = useState<Record<string, any> | null>(null);
  const [creating, setCreating] = useState<Record<string, any> | null>(null);
  const [pending, start] = useTransition();
  const take = 50;

  const idField = active?.fields.find((f) => f.isId)?.name ?? "id";

  const load = useCallback(async (m: Model, s = 0, flts: Filter[] = []) => {
    const { rows, total } = await listRows(m.name, {
      skip: s,
      take,
      filters: flts,
    });
    setActive(m);
    setRows(rows);
    setTotal(total);
    setSkip(s);
    setEdit(null);
    setCreating(null);
  }, []);

  function pick(m: Model) {
    setFilters([]);
    load(m, 0, []);
  }
  function applyFilters() {
    if (active)
      load(
        active,
        0,
        filters.filter((f) => f.value !== ""),
      );
  }
  function addFilter() {
    if (!active) return;
    const f = active.fields[0];
    setFilters([
      ...filters,
      {
        field: f.name,
        op: isNumeric(f.type) ? "equals" : "contains",
        value: "",
      },
    ]);
  }

  function save() {
    if (!active || !edit) return;
    start(async () => {
      try {
        await updateRow(active.name, edit[idField], edit);
        toast.success("Guardado");
        await load(active, skip, filters);
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  }
  function insert() {
    if (!active || !creating) return;
    start(async () => {
      try {
        await createRow(active.name, creating);
        toast.success("Creado");
        await load(active, skip, filters);
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  }
  function remove(id: any) {
    if (!active || !confirm("¿Eliminar fila?")) return;
    start(async () => {
      try {
        await deleteRow(active.name, id);
        toast.success("Eliminado");
        await load(active, skip, filters);
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  }

  return (
    <div className="flex h-screen">
      <aside className="w-56 border-r overflow-auto p-2 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-2">
          <InicioButton label="Inicio" iconSize={14} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2" />
          <UsuarioActual className="text-muted-foreground" />
        </div>
        <h2 className="font-bold mb-2 px-2">Tablas</h2>
        {models.map((m) => (
          <button
            key={m.name}
            onClick={() => pick(m)}
            className={`block w-full text-left px-2 py-1 rounded text-sm ${active?.name === m.name ? "bg-accent font-medium" : "hover:bg-muted"}`}
          >
            {m.name}
          </button>
        ))}
      </aside>

      <main className="flex-1 overflow-auto p-4">
        {!active ? (
          <p className="text-muted-foreground">Elegí una tabla.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h1 className="text-lg font-bold">{active.name}</h1>
              <span className="text-sm text-muted-foreground">
                {total} filas
              </span>
              <Button size="sm" onClick={() => setCreating(blank(active))}>
                + Nuevo
              </Button>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={skip === 0}
                  onClick={() => load(active, skip - take, filters)}
                >
                  ←
                </Button>
                <span className="text-sm self-center">
                  {total ? skip + 1 : 0}–{Math.min(skip + take, total)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={skip + take >= total}
                  onClick={() => load(active, skip + take, filters)}
                >
                  →
                </Button>
              </div>
            </div>

            {/* Filtros */}
            <div className="mb-3 space-y-2">
              {filters.map((flt, i) => {
                const fld = active.fields.find((f) => f.name === flt.field)!;
                const ops = isNumeric(fld.type) ? NUM_OPS : TEXT_OPS;
                return (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      className="h-8 border rounded px-2 text-sm bg-background"
                      value={flt.field}
                      onChange={(e) => {
                        const nf = active.fields.find(
                          (f) => f.name === e.target.value,
                        )!;
                        upd(i, {
                          field: e.target.value,
                          op: isNumeric(nf.type) ? "equals" : "contains",
                        });
                      }}
                    >
                      {active.fields.map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-8 border rounded px-2 text-sm bg-background"
                      value={flt.op}
                      onChange={(e) => upd(i, { op: e.target.value })}
                    >
                      {ops.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="h-8 w-48"
                      value={flt.value}
                      onChange={(e) => upd(i, { value: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setFilters(filters.filter((_, j) => j !== i))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addFilter}>
                  + Filtro
                </Button>
                {filters.length > 0 && (
                  <Button size="sm" onClick={applyFilters}>
                    Aplicar
                  </Button>
                )}
                {filters.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFilters([]);
                      load(active, 0, []);
                    }}
                  >
                    Limpiar
                  </Button>
                )}
              </div>
            </div>

            {/* Form nuevo */}
            {creating && (
              <div className="mb-3 border rounded p-3 bg-muted/40">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {active.fields
                    .filter((f) => !(f.isId && f.hasDefault))
                    .map((f) => (
                      <label
                        key={f.name}
                        className="text-xs flex flex-col gap-1"
                      >
                        <span>
                          {f.name}
                          {f.required && (
                            <span className="text-red-500">*</span>
                          )}{" "}
                          <span className="text-muted-foreground">
                            {f.type}
                            {f.isList ? "[]" : ""}
                          </span>
                        </span>
                        {f.type === "Boolean" ? (
                          <input
                            type="checkbox"
                            checked={!!creating[f.name]}
                            onChange={(e) =>
                              setCreating({
                                ...creating,
                                [f.name]: e.target.checked,
                              })
                            }
                          />
                        ) : (
                          <Input
                            className="h-7"
                            value={creating[f.name] ?? ""}
                            onChange={(e) =>
                              setCreating({
                                ...creating,
                                [f.name]: e.target.value,
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" disabled={pending} onClick={insert}>
                    Crear
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCreating(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-auto border rounded">
              <table className="text-sm w-max">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">·</th>
                    {active.fields.map((f) => (
                      <th
                        key={f.name}
                        className="px-2 py-1 text-left whitespace-nowrap"
                      >
                        {f.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const editing =
                      edit && String(edit[idField]) === String(r[idField]);
                    return (
                      <tr key={r[idField]} className="border-t">
                        <td className="px-2 py-1 whitespace-nowrap">
                          {editing ? (
                            <span className="flex gap-1">
                              <Button
                                size="sm"
                                disabled={pending}
                                onClick={save}
                              >
                                ✓
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEdit(null)}
                              >
                                ✕
                              </Button>
                            </span>
                          ) : (
                            <span className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEdit({ ...r })}
                              >
                                ✎
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => remove(r[idField])}
                              >
                                🗑
                              </Button>
                            </span>
                          )}
                        </td>
                        {active.fields.map((f) => (
                          <td
                            key={f.name}
                            className="px-2 py-1 whitespace-nowrap max-w-xs truncate"
                          >
                            {editing && !f.isId ? (
                              f.type === "Boolean" ? (
                                <input
                                  type="checkbox"
                                  checked={!!edit[f.name]}
                                  onChange={(e) =>
                                    setEdit({
                                      ...edit,
                                      [f.name]: e.target.checked,
                                    })
                                  }
                                />
                              ) : (
                                <Input
                                  className="h-7 w-40"
                                  value={edit[f.name] ?? ""}
                                  onChange={(e) =>
                                    setEdit({
                                      ...edit,
                                      [f.name]: e.target.value,
                                    })
                                  }
                                />
                              )
                            ) : (
                              fmt(r[f.name])
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );

  function upd(i: number, patch: Partial<Filter>) {
    setFilters((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }
}

function blank(m: Model): Record<string, any> {
  const o: Record<string, any> = {};
  for (const f of m.fields) o[f.name] = f.type === "Boolean" ? false : "";
  return o;
}
function fmt(v: any) {
  if (v == null) return <span className="text-muted-foreground">null</span>;
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
