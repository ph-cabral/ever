"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";

export interface MenuNode {
  label: string;
  href: string;
  color?: string; // sólo módulos de primer nivel
  children: MenuNode[];
}

/** Colapsa cadenas de un solo hijo: si un nodo tiene exactamente 1 hijo, baja. */
function collapse(node: MenuNode): MenuNode {
  let n = node;
  while (n.children.length === 1) n = n.children[0];
  return n;
}

const RADIUS = 168; // distancia de los botones "explotados" al centro

export function HomeMenu({ modules }: { modules: MenuNode[] }) {
  const router = useRouter();
  // path = cadena de nodos "activos"; vacío = grilla de módulos.
  const [path, setPath] = useState<MenuNode[]>([]);

  const center = path[path.length - 1] ?? null;

  function activate(node: MenuNode) {
    const t = collapse(node);
    if (t.children.length === 0) {
      router.push(t.href); // hoja: navega directo
      return;
    }
    setPath((p) => [...p, t]); // tiene ≥2 hijos: se vuelve el centro
  }

  function back() {
    setPath((p) => p.slice(0, -1));
  }

  // ---------- Grilla de módulos (nivel base) ----------
  if (!center) {
    if (modules.length === 0) {
      return (
        <p className="text-white/60 text-center max-w-sm">
          Todavía no tenés módulos habilitados. Pedile a un administrador que configure los
          permisos de tu sector.
        </p>
      );
    }
    return (
      <div className="flex flex-wrap justify-center gap-5 max-w-3xl">
        {modules.map((m) => (
          <button
            key={m.href}
            onClick={() => activate(m)}
            className={`w-56 px-8 py-6 ${m.color ?? "bg-slate-700 hover:bg-slate-600"} text-center text-white text-xl font-semibold rounded-2xl transition-transform hover:scale-105 active:scale-95`}
          >
            {m.label}
          </button>
        ))}
      </div>
    );
  }

  // ---------- Vista drill: centro + hijos "explotando" alrededor ----------
  const kids = center.children;
  const n = kids.length;
  const rootColor = path[0]?.color ?? "bg-slate-700 hover:bg-slate-600";

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Barra: volver + breadcrumb + cerrar */}
      <div className="menu-fade-in mb-6 flex w-full max-w-3xl items-center gap-2 px-2">
        <button
          onClick={back}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <ChevronLeft className="size-4" /> Volver
        </button>
        <nav className="flex flex-wrap items-center gap-1 text-sm text-white/50">
          {path.map((p, i) => (
            <span key={p.href} className="flex items-center gap-1">
              {i > 0 && <span className="text-white/25">/</span>}
              <button
                onClick={() => setPath((prev) => prev.slice(0, i + 1))}
                className={i === path.length - 1 ? "text-white/90" : "hover:text-white/80"}
              >
                {p.label}
              </button>
            </span>
          ))}
        </nav>
        <button
          onClick={() => setPath([])}
          title="Cerrar"
          className="ml-auto rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Escenario radial */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: RADIUS * 2 + 240, height: RADIUS * 2 + 120 }}
      >
        {/* Botones hijos: explotan desde el centro */}
        {kids.map((c, i) => {
          const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
          const bx = Math.cos(angle) * RADIUS;
          const by = Math.sin(angle) * RADIUS;
          return (
            // Overlay centra el botón en el centro del escenario; la animación lo "explota" hacia afuera.
            <div
              key={c.href}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <button
                onClick={() => activate(c)}
                className="menu-burst pointer-events-auto rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur hover:bg-white/20"
                style={
                  {
                    "--bx": `${bx}px`,
                    "--by": `${by}px`,
                    animationDelay: `${i * 45}ms`,
                  } as CSSProperties
                }
              >
                {c.label}
                {c.children.length > 0 && <span className="ml-1 text-white/50">›</span>}
              </button>
            </div>
          );
        })}

        {/* Centro: nodo activo (click = entra a su página índice) */}
        <button
          key={center.href}
          onClick={() => router.push(center.href)}
          className={`menu-jump relative z-10 w-48 rounded-2xl ${rootColor} px-6 py-8 text-center text-xl font-semibold text-white shadow-xl`}
          title="Abrir"
        >
          {center.label}
        </button>
      </div>
    </div>
  );
}
