"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";

/**
 * Nombre del usuario logueado, para la esquina superior derecha del header
 * de cualquier vista (2026-08-25: "agregá el nombre de quien
 * está logueado arriba a la derecha, en todas las vistas").
 *
 * Lee /api/auth/me (misma fuente que usa /login y el home). Si no hay sesión
 * — o todavía no respondió — no renderiza nada, así nunca deja un hueco ni
 * rompe el layout del header en el que se inserte.
 */
export function UsuarioActual({ className = "" }: { className?: string }) {
  const [usuario, setUsuario] = useState<{ nombre?: string; rol?: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d?.usuario?.nombre) setUsuario(d.usuario);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (!usuario?.nombre) return null;

  // Si quien lo usa pasa su propio color de texto (vistas con fondo claro:
  // legajos, relojes, asistencia, mangueras, /db), no imponemos el zinc-400
  // ni el amarillo del ícono — hereda el color del contenedor.
  const colorPropio = /(^|\s)text-/.test(className);

  return (
    <span
      title={usuario.rol === "ADMIN" ? `${usuario.nombre} · Administrador` : usuario.nombre}
      className={`inline-flex items-center gap-1.5 shrink-0 text-sm whitespace-nowrap ${
        colorPropio ? "" : "text-zinc-400"
      } ${className}`}
    >
      <User size={14} className={colorPropio ? "opacity-70" : "text-yellow-400"} />
      <span className="max-w-[180px] truncate">{usuario.nombre}</span>
    </span>
  );
}
