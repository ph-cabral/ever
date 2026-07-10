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

/** Colapsa cadenas de un solo hijo (sólo al entrar desde la grilla de módulos). */
function collapse(node: MenuNode): MenuNode {
  let n = node;
  while (n.children.length === 1) n = n.children[0];
  return n;
}

const RADIUS = 168; // radio del primer anillo (hijos directos del centro)
const RADIUS_FALLOFF = 0.6; // cada anillo más profundo (nietos, bisnietos...) es más chico

interface Positioned {
  node: MenuNode;
  x: number;
  y: number;
  depth: number; // 0 = hijo directo del centro, 1 = nieto, ...
}

/** Ubica TODO el árbol de un nodo en anillos concéntricos, siempre visible (sin drill). */
function layout(node: MenuNode, cx: number, cy: number, depth: number): Positioned[] {
  const kids = node.children;
  const n = kids.length;
  if (n === 0) return [];
  const radius = RADIUS * Math.pow(RADIUS_FALLOFF, depth);
  const out: Positioned[] = [];
  kids.forEach((c, i) => {
    const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    out.push({ node: c, x, y, depth });
    out.push(...layout(c, x, y, depth + 1)); // hijos de este hijo orbitan alrededor de él
  });
  return out;
}

export function HomeMenu({ modules }: { modules: MenuNode[] }) {
  const router = useRouter();
  // center = módulo activo (árbol de skills completo); null = grilla de módulos.
  const [center, setCenter] = useState<MenuNode | null>(null);

  function enter(node: MenuNode) {
    // El colapso de cadenas de 1 hijo sólo aplica al entrar desde la grilla.
    const t = collapse(node);
    if (t.children.length === 0) {
      router.push(t.href); // módulo sin sub-vistas (o cadena de 1 hijo): navega directo
      return;
    }
    setCenter(t);
  }

  function back() {
    setCenter(null);
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
            onClick={() => enter(m)}
            className={`w-56 px-8 py-6 ${m.color ?? "bg-slate-700 hover:bg-slate-600"} text-center text-white text-xl font-semibold rounded-2xl transition-transform hover:scale-105 active:scale-95`}
          >
            {m.label}
          </button>
        ))}
      </div>
    );
  }

  // ---------- Árbol de skills: centro + TODOS los descendientes orbitando ----------
  const positioned = layout(center, 0, 0, 0);
  const rootColor = center.color ?? "bg-slate-700 hover:bg-slate-600";
  const stageHalf = RADIUS + 140; // margen para anillos internos + texto

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Barra: volver + módulo actual + cerrar */}
      <div className="menu-fade-in mb-6 flex w-full max-w-3xl items-center gap-2 px-2">
        <button
          onClick={back}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <ChevronLeft className="size-4" /> Volver
        </button>
        <span className="text-sm text-white/90">{center.label}</span>
        <button
          onClick={back}
          title="Cerrar"
          className="ml-auto rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Escenario radial: todo el árbol siempre visible, sin cambiar de vista */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: stageHalf * 2, height: stageHalf * 2 }}
      >
        {/* Descendientes: explotan desde el centro, cada anillo más chico según profundidad */}
        {positioned.map((p, i) => (
          <div
            key={p.node.href}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <button
              onClick={() => router.push(p.node.href)}
              className={`menu-burst pointer-events-auto rounded-xl bg-white/10 font-medium text-white ring-1 ring-white/15 backdrop-blur hover:bg-white/20 ${
                p.depth === 0 ? "px-4 py-3 text-sm" : "px-3 py-2 text-xs opacity-90"
              }`}
              style={
                {
                  "--bx": `${p.x}px`,
                  "--by": `${p.y}px`,
                  animationDelay: `${i * 45}ms`,
                } as CSSProperties
              }
            >
              {p.node.label}
            </button>
          </div>
        ))}

        {/* Centro: módulo activo (click = entra a su página índice) */}
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
