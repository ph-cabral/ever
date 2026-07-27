"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const DEFAULT_TITLE = "EverWear · Sistema interno";

// "compras" -> "comp"
function abbr(seg: string): string {
  return seg.slice(0, 4).toLowerCase();
}

/**
 * Pone el título de la pestaña en base a la ruta actual, para cualquier vista
 * de la app (actual y futura), sin tener que tocar cada page.tsx.
 * Ej: /compras/faltantes          -> "comp > faltantes"
 *     /deposito/faltantes/duplicadas -> "depo > falt > duplicadas"
 *     /sistema                    -> "sistema"
 *     /                           -> título default (home)
 */
export function TabTitle() {
  const pathname = usePathname();

  useEffect(() => {
    const segments = (pathname ?? "/").split("/").filter(Boolean);

    if (segments.length === 0) {
      document.title = DEFAULT_TITLE;
      return;
    }

    const last = segments[segments.length - 1];
    const crumbs = [...segments.slice(0, -1).map(abbr), last.toLowerCase()];
    document.title = crumbs.join(" > ");
  }, [pathname]);

  return null;
}
