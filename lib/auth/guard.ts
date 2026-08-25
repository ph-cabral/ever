// Guards de autorización para route handlers (runtime Node).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "./session";
import { moduleForPath } from "./modules";

export type Guard =
  | { ok: true; bootstrap: boolean }
  | { ok: false; status: number; error: string };

/**
 * Permite el alta de usuarios sólo a un ADMIN.
 * Excepción (bootstrap): si todavía no hay ningún usuario, deja crear el primero
 * (que quedará como ADMIN) sin sesión previa.
 */
export async function guardAltaUsuario(): Promise<Guard> {
  const count = await prisma.usuario.count();
  if (count === 0) return { ok: true, bootstrap: true };
  const s = await getSession();
  if (!s) return { ok: false, status: 401, error: "No autenticado" };
  if (s.rol !== "ADMIN")
    return { ok: false, status: 403, error: "Sólo un admin puede dar de alta usuarios" };
  return { ok: true, bootstrap: false };
}

/**
 * Autorización PARA RUTAS EXCLUIDAS DEL MATCHER DEL MIDDLEWARE.
 *
 * Con `runtime: "nodejs"` el middleware de Next 15.5 rompe los POST con body
 * multipart/grande ("TypeError: Response body object should not be disturbed or
 * locked" antes de entrar al handler). La única salida es sacar esas rutas del
 * matcher (ver middleware.ts) — y entonces el chequeo de sesión/permiso que
 * hacía el middleware hay que hacerlo acá adentro, o la ruta queda abierta.
 *
 * Replica los pasos 1 y 3 del middleware: sesión válida + módulo permitido.
 * Devuelve `null` si pasa, o la NextResponse de error si no.
 */
export async function bloqueoPorAcceso(pathname: string): Promise<NextResponse | null> {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (s.rol === "ADMIN") return null;
  const mod = moduleForPath(pathname);
  if (mod && !s.mods?.includes(mod))
    return NextResponse.json({ error: "Sin permiso para este módulo" }, { status: 403 });
  return null;
}

export async function requireAdmin(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const s = await getSession();
  if (!s) return { ok: false, status: 401, error: "No autenticado" };
  if (s.rol !== "ADMIN") return { ok: false, status: 403, error: "Requiere rol ADMIN" };
  return { ok: true };
}
