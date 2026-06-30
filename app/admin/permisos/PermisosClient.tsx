"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Eye, EyeOff, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Vista = { label: string; href: string };
type Mod = { key: string; label: string; vistas: Vista[] };
type Item = {
  sector: string;
  modulos: string[];
  vistas: string[];
  ocultos: string[];
  guardado: boolean;
};

export function PermisosClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [abierto, setAbierto] = useState<Record<string, boolean>>({});

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

  function update(sector: string, fn: (it: Item) => Item) {
    setItems((prev) => prev.map((it) => (it.sector === sector ? fn(it) : it)));
    setDirty(true);
  }

  // Activar/desactivar un módulo: al activar, habilita todas sus vistas.
  function toggleMod(sector: string, m: Mod) {
    update(sector, (it) => {
      const has = it.modulos.includes(m.key);
      const viewHrefs = m.vistas.map((v) => v.href);
      if (has) {
        return {
          ...it,
          modulos: it.modulos.filter((k) => k !== m.key),
          vistas: it.vistas.filter((h) => !viewHrefs.includes(h)),
          ocultos: it.ocultos.filter((x) => x !== m.key && !viewHrefs.includes(x)),
        };
      }
      return {
        ...it,
        modulos: [...it.modulos, m.key],
        vistas: [...new Set([...it.vistas, ...viewHrefs])],
      };
    });
  }

  function toggleVista(sector: string, href: string) {
    update(sector, (it) => {
      const has = it.vistas.includes(href);
      return {
        ...it,
        vistas: has ? it.vistas.filter((h) => h !== href) : [...it.vistas, href],
        ocultos: has ? it.ocultos.filter((x) => x !== href) : it.ocultos,
      };
    });
  }

  // Ojo: visible/oculto en el inicio (sin afectar acceso). id = key de módulo o href de vista.
  function toggleOculto(sector: string, id: string) {
    update(sector, (it) => ({
      ...it,
      ocultos: it.ocultos.includes(id)
        ? it.ocultos.filter((x) => x !== id)
        : [...it.ocultos, id],
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/permisos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(({ sector, modulos, vistas, ocultos }) => ({
            sector,
            modulos,
            vistas,
            ocultos,
          })),
        }),
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

  function OjoBtn({ on, onClick, title }: { on: boolean; onClick: () => void; title: string }) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {on ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    );
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
        Marcá qué apps y vistas puede usar cada sector. El ícono de ojo oculta el ítem del inicio
        sin quitarle el acceso. Los cambios aplican en el próximo inicio de sesión de cada persona.
      </p>

      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay sectores cargados todavía.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((it) => {
            const open = abierto[it.sector] ?? false;
            return (
              <div key={it.sector} className="rounded-lg ring-1 ring-foreground/10">
                <button
                  type="button"
                  onClick={() => setAbierto((a) => ({ ...a, [it.sector]: !open }))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                >
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  <span className="font-medium">{it.sector}</span>
                  {!it.guardado && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      default
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {it.modulos.length} app(s)
                  </span>
                </button>

                {open && (
                  <div className="border-t border-border px-3 py-2">
                    {mods.map((m) => {
                      const enabled = it.modulos.includes(m.key);
                      return (
                        <div key={m.key} className="py-1">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={enabled}
                              onCheckedChange={() => toggleMod(it.sector, m)}
                            />
                            <span className={enabled ? "font-medium" : "text-muted-foreground"}>
                              {m.label}
                            </span>
                            {enabled && (
                              <OjoBtn
                                on={it.ocultos.includes(m.key)}
                                onClick={() => toggleOculto(it.sector, m.key)}
                                title="Mostrar/ocultar app en el inicio"
                              />
                            )}
                          </div>

                          {enabled && m.vistas.length > 0 && (
                            <div className="ml-7 mt-1 flex flex-col gap-1">
                              {m.vistas.map((v) => {
                                const allowed = it.vistas.includes(v.href);
                                return (
                                  <div key={v.href} className="flex items-center gap-2">
                                    <Checkbox
                                      checked={allowed}
                                      onCheckedChange={() => toggleVista(it.sector, v.href)}
                                    />
                                    <span
                                      className={
                                        allowed ? "text-sm" : "text-sm text-muted-foreground"
                                      }
                                    >
                                      {v.label}
                                    </span>
                                    {allowed && (
                                      <OjoBtn
                                        on={it.ocultos.includes(v.href)}
                                        onClick={() => toggleOculto(it.sector, v.href)}
                                        title="Mostrar/ocultar vista en el inicio"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
