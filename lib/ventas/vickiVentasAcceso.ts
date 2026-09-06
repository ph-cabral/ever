import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * Acceso a datos de ventas desde el chat de Vicki (intent "ventas" en
 * vicki_chat/app/nodes.py — ver memoria "integracion-mcp-vicki-chat").
 *
 * Reglas:
 *   · ADMIN: habilitado siempre, sin filtro de vendedor (ve toda la empresa).
 *   · No-admin: habilitado SOLO si `usuario.vickiVentasAcceso = true`
 *     (lo asigna un admin en /admin/usuarios), y aunque esté habilitado
 *     SIEMPRE ve nada más que su propio `vendedorCodigo`. Sin vendedorCodigo
 *     asignado, aunque esté habilitado, no puede consultar nada — mismo
 *     criterio que /ventas/vendedor.
 *
 * Se resuelve en VIVO contra Postgres (no desde la cookie), igual que
 * resolverAccesoVendedor(): activar/desactivar a alguien surte efecto en su
 * próximo mensaje al chat, sin relogin.
 *
 * IMPORTANTE: el vendedorCodigo que devuelve esta función es el ÚNICO que
 * puede viajar hacia vicki_chat para un no-admin. El nodo de ventas de
 * vicki_chat NO debe aceptar un vendedorCodigo elegido por el usuario o
 * inferido del mensaje — si lo hiciera, cualquiera podría pedirle a Vicki la
 * facturación de otro vendedor con solo nombrarlo en el chat.
 */
export type AccesoVickiVentas =
  | { ok: true; habilitado: true; isAdmin: true; vendedorCodigo: null }
  | { ok: true; habilitado: true; isAdmin: false; vendedorCodigo: number }
  | { ok: true; habilitado: false; isAdmin: boolean; vendedorCodigo: number | null }
  | { ok: false; status: number; error: string };

export async function resolverAccesoVickiVentas(): Promise<AccesoVickiVentas> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "No autenticado" };

  if (session.rol === "ADMIN") {
    return { ok: true, habilitado: true, isAdmin: true, vendedorCodigo: null };
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.uid },
    select: { vendedorCodigo: true, vickiVentasAcceso: true },
  });

  if (!usuario?.vickiVentasAcceso) {
    return {
      ok: true,
      habilitado: false,
      isAdmin: false,
      vendedorCodigo: usuario?.vendedorCodigo ?? null,
    };
  }
  if (usuario.vendedorCodigo == null) {
    // habilitado pero sin vendedor asignado: cero datos, no "toda la empresa"
    return { ok: true, habilitado: false, isAdmin: false, vendedorCodigo: null };
  }
  return {
    ok: true,
    habilitado: true,
    isAdmin: false,
    vendedorCodigo: usuario.vendedorCodigo,
  };
}
