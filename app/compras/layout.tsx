"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  PackageX,
  LineChart,
  ChevronRight,
  ShoppingCart,
  ListTodo,
  Star,
  Plus,
  X,
  Search,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// Layout de /compras/* — sidebar auto-oculta (pedido de Pablo 2026-08-11):
// escondida fuera de pantalla; aparece cuando el mouse se acerca al borde
// izquierdo (franja invisible de 12px + pestaña con chevron como pista
// visual) y se vuelve a esconder al salir. Overlay fijo: no corre el layout
// de las páginas, así que cada page.tsx de compras queda igual que antes.
// Lista TODAS las ubicaciones de compras — al agregar una vista nueva bajo
// app/compras/, sumarla a NAV.
//
// "Mis accesos" (pedido de Pablo 2026-08-26): cada usuario marca con la
// estrella (⭐ al pasar el mouse) las vistas que quiere tener a mano; quedan
// fijadas arriba de todo, por usuario, guardadas en everwear.usuario_acceso
// (ver sql/usuario_acceso.sql y app/api/preferencias/accesos/route.ts). Con el
// botón "+" se puede fijar CUALQUIER vista de la app permitida para ese
// usuario, no sólo las de compras. Marcar es preferencia, no permiso: el
// catálogo ya viene filtrado por los permisos de la sesión desde la API.
// ──────────────────────────────────────────────────────────────────────────────

const NAV: { href: string; label: string; icon: typeof BarChart3 }[] = [
  { href: "/compras", label: "Métricas", icon: BarChart3 },
  { href: "/compras/faltantes", label: "Faltantes", icon: PackageX },
  { href: "/compras/consumo", label: "Consumo por artículo", icon: LineChart },
  { href: "/compras/tarea", label: "Tarea", icon: ListTodo },
];

interface Acceso {
  href: string;
  label: string;
}
interface CatalogoItem extends Acceso {
  grupo: string;
}

export default function ComprasLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [accesos, setAccesos] = useState<Acceso[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [cargado, setCargado] = useState(false);
  const [selector, setSelector] = useState(false); // panel "+ agregar acceso"
  const [q, setQ] = useState("");
  const pathname = usePathname();

  // Se carga una sola vez, y recién cuando la sidebar se abre por primera vez.
  useEffect(() => {
    if (!open || cargado) return;
    setCargado(true);
    fetch("/api/preferencias/accesos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setAccesos(d.accesos ?? []);
        setCatalogo(d.catalogo ?? []);
      })
      .catch(() => {});
  }, [open, cargado]);

  const fijado = useCallback(
    (href: string) => accesos.some((a) => a.href === href),
    [accesos],
  );

  // Optimista: la estrella responde al toque y después se persiste.
  const toggle = useCallback(
    async (href: string, label: string) => {
      const estaba = accesos.some((a) => a.href === href);
      setAccesos((prev) =>
        estaba ? prev.filter((a) => a.href !== href) : [...prev, { href, label }],
      );
      try {
        const r = estaba
          ? await fetch(`/api/preferencias/accesos?href=${encodeURIComponent(href)}`, {
              method: "DELETE",
            })
          : await fetch("/api/preferencias/accesos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ href }),
            });
        if (!r.ok) throw new Error();
      } catch {
        // Revertir si el server no lo aceptó.
        setAccesos((prev) =>
          estaba ? [...prev, { href, label }] : prev.filter((a) => a.href !== href),
        );
      }
    },
    [accesos],
  );

  const filtrado = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t
      ? catalogo.filter(
          (c) => c.label.toLowerCase().includes(t) || c.grupo.toLowerCase().includes(t),
        )
      : catalogo;
    // Agrupado por módulo, respetando el orden en que vino del catálogo.
    const grupos: { grupo: string; items: CatalogoItem[] }[] = [];
    for (const c of base) {
      const g = grupos.find((x) => x.grupo === c.grupo);
      if (g) g.items.push(c);
      else grupos.push({ grupo: c.grupo, items: [c] });
    }
    return grupos;
  }, [catalogo, q]);

  const cerrar = () => {
    setOpen(false);
    setSelector(false);
    setQ("");
  };

  return (
    <>
      {children}

      {/* Franja invisible pegada al borde izquierdo: acercar el mouse abre */}
      <div
        className="fixed left-0 top-0 h-full w-3 z-[120]"
        onMouseEnter={() => setOpen(true)}
      />

      {/* Pestaña siempre visible (pista de que hay sidebar) */}
      <div
        onMouseEnter={() => setOpen(true)}
        className={`fixed left-0 top-1/2 -translate-y-1/2 z-[120] flex items-center justify-center
          w-5 h-16 rounded-r-lg bg-[#1A1A1A] border border-l-0 border-yellow-400/40
          text-yellow-400 transition-opacity duration-200 ${open ? "opacity-0 pointer-events-none" : "opacity-80"}`}
      >
        <ChevronRight size={14} />
      </div>

      {/* Sidebar */}
      <aside
        onMouseLeave={cerrar}
        className={`fixed left-0 top-0 h-full w-60 z-[130] bg-[#161616] border-r border-zinc-800
          flex flex-col transition-transform duration-200 ease-out shadow-2xl shadow-black/60
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-zinc-800">
          <ShoppingCart size={18} className="text-yellow-400" />
          <span className="font-bold text-yellow-400 uppercase tracking-wide text-sm">
            Compras
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {/* ── Mis accesos (lo que marcó este usuario) ── */}
          {accesos.length > 0 && (
            <>
              <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
                Mis accesos
              </div>
              {accesos.map(({ href, label }) => (
                <ItemNav
                  key={`fav-${href}`}
                  href={href}
                  label={label}
                  activo={pathname === href}
                  fijado
                  onToggle={() => toggle(href, label)}
                  onNavegar={cerrar}
                />
              ))}
              <div className="h-px bg-zinc-800 mx-3 my-2" />
            </>
          )}

          {/* ── Vistas de compras ── */}
          <div className="px-3 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
            Compras
          </div>
          {NAV.map(({ href, label, icon: Icon }) => (
            <ItemNav
              key={href}
              href={href}
              label={label}
              icon={Icon}
              activo={pathname === href}
              fijado={fijado(href)}
              onToggle={() => toggle(href, label)}
              onNavegar={cerrar}
            />
          ))}

          {/* ── Agregar acceso de cualquier módulo ── */}
          <button
            onClick={() => setSelector((v) => !v)}
            className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed
              border-zinc-700 text-xs text-zinc-500 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            {selector ? <X size={14} /> : <Plus size={14} />}
            {selector ? "Cerrar" : "Agregar acceso"}
          </button>

          {selector && (
            <div className="mt-2 rounded-lg border border-zinc-800 bg-[#111] p-2">
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800">
                <Search size={13} className="text-zinc-600 shrink-0" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar vista…"
                  className="w-full bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none"
                />
              </div>
              <div className="mt-2 max-h-72 overflow-y-auto space-y-2 pr-0.5">
                {filtrado.length === 0 && (
                  <p className="px-2 py-3 text-[11px] text-zinc-600">Sin resultados.</p>
                )}
                {filtrado.map(({ grupo, items }) => (
                  <div key={grupo}>
                    <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-600">
                      {grupo}
                    </div>
                    {items.map((c) => {
                      const on = fijado(c.href);
                      return (
                        <button
                          key={c.href}
                          onClick={() => toggle(c.href, c.label)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs
                            text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
                        >
                          <Star
                            size={13}
                            className={on ? "text-yellow-400 shrink-0" : "text-zinc-600 shrink-0"}
                            fill={on ? "currentColor" : "none"}
                          />
                          <span className="truncate">{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="px-5 py-3 border-t border-zinc-800 text-[11px] text-zinc-600">
          EVER WEAR S.A. · Compras
        </div>
      </aside>
    </>
  );
}

// Fila de la sidebar: link + estrella. La estrella aparece al pasar el mouse
// (o queda fija en amarillo si ya está marcada) y NO navega (stopPropagation +
// preventDefault: es un <button> adentro de un <Link>).
function ItemNav({
  href,
  label,
  icon: Icon,
  activo,
  fijado,
  onToggle,
  onNavegar,
}: {
  href: string;
  label: string;
  icon?: typeof BarChart3;
  activo: boolean;
  fijado: boolean;
  onToggle: () => void;
  onNavegar: () => void;
}) {
  return (
    <div className="group relative">
      <Link
        href={href}
        onClick={onNavegar}
        className={`flex items-center gap-3 pl-3 pr-9 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
          activo
            ? "bg-yellow-400/10 border-yellow-400/40 text-yellow-400"
            : "border-transparent text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
        }`}
      >
        {Icon ? <Icon size={16} className="shrink-0" /> : <Star size={16} className="shrink-0 opacity-40" />}
        <span className="truncate">{label}</span>
      </Link>
      <button
        title={fijado ? "Quitar de Mis accesos" : "Fijar en Mis accesos"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-opacity ${
          fijado
            ? "opacity-100 text-yellow-400"
            : "opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-yellow-400"
        }`}
      >
        <Star size={14} fill={fijado ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
