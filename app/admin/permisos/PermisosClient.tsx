"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Item = { sector: string; modulos: string[]; guardado: boolean };
type Mod = { key: string; label: string };

export function PermisosClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/permisos");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      setItems(d.items);
      setMods(d.modulosDisponibles);
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar los permisos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(sector: string, modKey: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.sector !== sector) return it;
        const has = it.modulos.includes(modKey);
        return {
          ...it,
          modulos: has ? it.modulos.filter((m) => m !== modKey) : [...it.modulos, modKey],
        };
      }),
    );
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/permisos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map(({ sector, modulos }) => ({ sector, modulos })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      toast.success("Permisos guardados");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-medium">Permisos por sector</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Marcá qué módulos puede usar cada sector. Las filas en gris todavía usan los valores
        sugeridos por defecto (se guardan al confirmar). Los cambios aplican en el próximo inicio
        de sesión de cada persona.
      </p>

      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay sectores cargados todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium sticky left-0 bg-muted/50">Sector</th>
                {mods.map((m) => (
                  <th key={m.key} className="px-3 py-2 font-medium text-center whitespace-nowrap">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.sector} className="border-t border-border">
                  <td className="px-3 py-2 sticky left-0 bg-background">
                    <span className={it.guardado ? "" : "text-muted-foreground"}>{it.sector}</span>
                    {!it.guardado && (
                      <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        default
                      </span>
                    )}
                  </td>
                  {mods.map((m) => (
                    <td key={m.key} className="px-3 py-2 text-center">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={it.modulos.includes(m.key)}
                          onCheckedChange={() => toggle(it.sector, m.key)}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
