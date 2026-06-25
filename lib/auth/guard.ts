// Guards de autorización para route handlers (runtime Node).
import { prisma } from "@/lib/prisma";
import { getSession } from "./session";

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

export async function requireAdmin(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const s = await getSession();
  if (!s) return { ok: false, status: 401, error: "No autenticado" };
  if (s.rol !== "ADMIN") return { ok: false, status: 403, error: "Requiere rol ADMIN" };
  return { ok: true };
}
