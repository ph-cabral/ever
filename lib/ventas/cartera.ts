const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

/**
 * CodCliente de la cartera de un vendedor (zona ∪ historial de los últimos 24
 * meses) — proxy a indicadores-api GET /ventas/vendedor/cartera, que es quien
 * define el criterio (cartera.py, único lugar donde vive).
 *
 * Se usa para recortar a la cartera del vendedor logueado listados que YA
 * vienen armados de otra consulta (/ventas/faltantes: Magnus + preparado),
 * donde no hay dónde enchufar el JOIN de cartera. Devuelve un Set para que el
 * recorte sea O(1) por renglón — los faltantes se cuentan de a miles.
 *
 * Si el vendedor no tiene cartera (o la consulta falla) devuelve un Set vacío:
 * un no-admin sin clientes debe ver CERO faltantes, nunca "todos".
 */
export async function fetchCarteraClientes(vendedor: number): Promise<Set<number>> {
  const res = await fetch(
    `${API_URL}/ventas/vendedor/cartera?vendedor=${vendedor}`,
    { cache: "no-store", signal: AbortSignal.timeout(30000) },
  );
  if (!res.ok) throw new Error(`indicadores-api /ventas/vendedor/cartera → HTTP ${res.status}`);
  const j = await res.json();
  const arr: unknown[] = Array.isArray(j?.clientes) ? j.clientes : [];
  return new Set(arr.map((c) => Number(c)).filter((n) => Number.isFinite(n)));
}
