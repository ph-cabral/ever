import { resolverAccesoVendedor, type AccesoVendedor } from "./vendedorAcceso";

/**
 * Acceso por vendedor de /ventas/bulones.
 *
 * Regla general: la misma que /ventas/vendedor — un no-admin sólo ve SU
 * cartera (ver resolverAccesoVendedor). EXCEPCIÓN: hay vendedores que en la
 * vista de BULONERÍA tienen que ver el 100% de la consulta (toda la
 * empresa), porque manejan la línea entera y no una cartera.
 *
 * La excepción es SÓLO para /ventas/bulones: en /ventas/vendedor y en el
 * resto de la app esos usuarios siguen viendo únicamente su cartera (por eso
 * esto vive en un archivo aparte y no dentro de resolverAccesoVendedor).
 *
 * Quién la tiene lo decide un ADMIN desde /admin/usuarios, columna
 * "Bulonería" (bandera `usuario.bulonesAccesoTotal` en Postgres, ver
 * sql/usuario_bulones_acceso_total.sql). Hoy: el vendedor 797, Julio Blanco.
 *
 * Antes (hasta 2026-08-28) la lista era una constante de NOMBRES en este
 * archivo + la variable de entorno BULONES_VENDEDORES_ACCESO_TOTAL, y se
 * comparaba contra el catálogo de Magnus. Se reemplazó por la bandera porque:
 *   · sumar o sacar gente requería redeploy;
 *   · el match por nombre dependía de cómo estuviera escrito en Magnus
 *     ("JULIO BLANCO" no matcheaba "Blanco Julio Cesar");
 *   · obligaba a pedir el catálogo de vendedores (SQL Server) en cada
 *     request de bulonería sólo para saber el nombre del usuario logueado.
 * Ahora la bandera viaja en la misma consulta a Postgres que ya se hacía:
 * cero I/O adicional por request. La variable de entorno ya no se lee — si
 * quedó definida en algún compose, se puede borrar.
 */

/**
 * Igual que resolverAccesoVendedor(), pero devuelve `isAdmin: true` (= sin
 * filtro de cartera) también para los usuarios con `bulonesAccesoTotal`.
 * Usarlo SÓLO en las rutas de /api/ventas/bulones.
 */
export async function resolverAccesoBulones(): Promise<AccesoVendedor> {
  const acceso = await resolverAccesoVendedor();
  if (!acceso.ok) return acceso;
  if (acceso.isAdmin) return acceso;
  if (acceso.bulonesAccesoTotal) return { ok: true, isAdmin: true, vendedorCodigo: null };
  return acceso;
}
