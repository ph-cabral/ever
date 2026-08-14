import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type AccesoVendedor =
  | { ok: true; isAdmin: true; vendedorCodigo: null }
  | { ok: true; isAdmin: false; vendedorCodigo: number | null }
  | { ok: false; status: number; error: string };

/**
 * Acceso por vendedor de /ventas/vendedor (pedido de Pablo 2026-08-14): un
 * usuario no-admin solo puede ver los clientes de SU vendedor
 * (usuario.vendedorCodigo, asignado por un admin en /admin/usuarios contra
 * el catálogo de Magnus — Ped_Usu_Arma). Los ADMIN no tienen restricción
 * (ven todos los clientes).
 *
 * `vendedorCodigo: null` en un no-admin significa "todavía sin vendedor
 * asignado" — las rutas que llaman a esto deben tratarlo como CERO clientes
 * visibles, no como "sin restricción" (pedido explícito de Pablo: "si no
 * coincide no debería traer dato, ni aparecer en el filtro").
 *
 * Se resuelve en VIVO contra Postgres (prisma.usuario), no desde la cookie
 * de sesión — así que asignar/cambiar el vendedorCodigo de alguien surte
 * efecto en su próxima consulta, sin esperar a que vuelva a loguearse
 * (distinto de rol/sector, que sí requieren relogin — ver nota en
 * UsuariosClient.tsx).
 */
export async function resolverAccesoVendedor(): Promise<AccesoVendedor> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "No autenticado" };
  if (session.rol === "ADMIN") return { ok: true, isAdmin: true, vendedorCodigo: null };
  const usuario = await prisma.usuario.findUnique({
    where: { id: session.uid },
    select: { vendedorCodigo: true },
  });
  return { ok: true, isAdmin: false, vendedorCodigo: usuario?.vendedorCodigo ?? null };
}
