"use client";

import Link from "next/link";
import { Home } from "lucide-react";

/**
 * Link "Inicio" (vuelve a "/") para el header de cualquier vista.
 * Sin label = ícono solo (headers angostos tipo barra amarilla, junto a
 * Refrescar/Exportar). Con label = ícono + texto (headers tipo admin/sistema).
 */
export function InicioButton({
  label,
  iconSize = 18,
  className = "text-zinc-400 hover:text-yellow-400 transition-colors p-2",
}: {
  label?: string;
  iconSize?: number;
  className?: string;
}) {
  return (
    <Link href="/" title="Inicio" className={`inline-flex items-center gap-1.5 shrink-0 ${className}`}>
      <Home size={iconSize} />
      {label}
    </Link>
  );
}
