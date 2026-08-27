const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export interface VendedorCatalogo {
  codigo: number;
  nombre: string | null;
  /** Estado_Desc del maestro empieza con "Habilitado" y el nombre no es "(baja)…". */
  activo: boolean;
  /** Es una persona, no un canal/zona/agrupador (MOSTRADORES, ZONA CBA, …). */
  persona: boolean;
}

/**
 * Catálogo de vendedores de Magnus (maestro `Vendedores`) — proxy a
 * indicadores-api, que es quien lo lee y calcula las banderas
 * `activo`/`persona` (ver fetch_vendedores en ventas.py).
 */
export async function fetchCatalogoVendedores(): Promise<VendedorCatalogo[]> {
  const res = await fetch(`${API_URL}/vendedores`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`indicadores-api /vendedores → HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j?.vendedores) ? j.vendedores : [];
}

/**
 * Vendedores para el filtro de admin de /ventas/vendedor: personas activas
 * del maestro `Vendedores`.
 *
 * Antes (2026-08-27, primera versión) esto se armaba cruzando
 * `usuario.vendedorCodigo` con legajos ACTIVOS de sector viajante. Se
 * reemplazó el mismo día: el maestro de Magnus ya trae `Estado_Desc`, que es
 * el dato de verdad y no depende de que el vendedor tenga usuario en la app
 * ni de cómo esté escrito el sector en su legajo. Un viajante nuevo aparece
 * en el filtro apenas lo cargan en Magnus.
 */
export async function listarVendedoresActivos(): Promise<VendedorCatalogo[]> {
  const todos = await fetchCatalogoVendedores();
  return todos
    .filter((v) => v.activo && v.persona)
    .sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));
}
