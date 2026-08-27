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

/**
 * Código de vendedor que hay que mandarle al backend en una request de
 * /ventas/vendedor, ya resuelto para los dos casos:
 *
 *   · no-admin → SIEMPRE su propio vendedorCodigo (no puede elegir).
 *   · admin    → el `?vendedor=` del filtro de la vista si vino, o null =
 *     sin restricción (toda la empresa, comportamiento de siempre).
 *
 * Filtro de vendedor para administradores (pedido de Pablo 2026-08-27): el
 * admin elige un viajante del selector del header y toda la vista (buscador
 * de clientes, tabla, rankings) pasa a mostrar SOLO su cartera. Es una
 * comodidad de lectura, no un control de seguridad — un admin ya puede ver
 * todo —, por eso acá alcanza con validar que sea un entero positivo y no
 * hace falta chequearlo contra la lista de vendedores activos.
 */
export function vendedorParam(
  sp: URLSearchParams,
  acceso: Extract<AccesoVendedor, { ok: true }>,
): string | null {
  if (!acceso.isAdmin) return acceso.vendedorCodigo ? String(acceso.vendedorCodigo) : null;
  const v = sp.get("vendedor")?.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? String(n) : null;
}
