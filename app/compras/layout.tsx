"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, PackageX, LineChart, ChevronRight, ShoppingCart, ListTodo } from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// Layout de /compras/* — sidebar auto-oculta (pedido de Pablo 2026-08-11):
// escondida fuera de pantalla; aparece cuando el mouse se acerca al borde
// izquierdo (franja invisible de 12px + pestaña con chevron como pista
// visual) y se vuelve a esconder al salir. Overlay fijo: no corre el layout
// de las páginas, así que cada page.tsx de compras queda igual que antes.
// Lista TODAS las ubicaciones de compras — al agregar una vista nueva bajo
// app/compras/, sumarla a NAV.
// ──────────────────────────────────────────────────────────────────────────────

const NAV: { href: string; label: string; icon: typeof BarChart3 }[] = [
  { href: "/compras", label: "Métricas", icon: BarChart3 },
  { href: "/compras/faltantes", label: "Faltantes", icon: PackageX },
  { href: "/compras/consumo", label: "Consumo por artículo", icon: LineChart },
  { href: "/compras/tarea", label: "Tarea", icon: ListTodo },
];

export default function ComprasLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
        onMouseLeave={() => setOpen(false)}
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
        <nav className="flex-1 py-3 px-2 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const activo = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  activo
                    ? "bg-yellow-400/10 border-yellow-400/40 text-yellow-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-3 border-t border-zinc-800 text-[11px] text-zinc-600">
          EVER WEAR S.A. · Compras
        </div>
      </aside>
    </>
  );
}
