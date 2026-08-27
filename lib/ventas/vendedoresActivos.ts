import { prisma } from "@/lib/prisma";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

/**
 * Sectores del LEGAJO (everwear.legajo.sector / sector.nombre) que cuentan
 * como "vendedor" para el filtro de vendedores de /ventas/vendedor (pedido
 * de Pablo 2026-08-27: "los activos que están en sector viajante
 * lubricantes y viajante mayorista").
 *
 * Se listan como TOKENS y se matchea "contiene todos" sin distinguir
 * mayúsculas, a propósito: así entran igual "Viajante Lubricantes",
 * "Viajantes lubricantes" o "Viajante - Lubricantes", sin depender de cómo
 * quedó escrito exactamente el sector en cada legajo. Si mañana hay otro
 * sector de ventas, alcanza con sumar sus tokens acá.
 */
export const SECTORES_VENDEDORES: string[][] = [
  ["viajante", "lubricante"],
  ["viajante", "mayorista"],
];

export interface VendedorActivo {
  codigo: number;
  nombre: string | null;
}

/**
 * Vendedores habilitados para el filtro de admin de /ventas/vendedor.
 *
 * El vínculo legajo ↔ código de vendedor de Magnus NO vive en el legajo: el
 * único lugar donde existe es `usuario.vendedorCodigo` (lo asigna un admin
 * en /admin/usuarios). Así que la lista sale de cruzar:
 *
 *   usuario.activo = true
 *   usuario.vendedorCodigo != null
 *   legajo.estado = 'ACTIVO'
 *   legajo.sector (o sector.nombre) ∈ SECTORES_VENDEDORES
 *
 * Consecuencia a tener en cuenta: un viajante que todavía no tiene usuario
 * en la app —o que lo tiene sin vendedorCodigo asignado— NO aparece en el
 * filtro, aunque su legajo esté activo. Se arregla asignándole el vendedor
 * en Administración → Usuarios.
 *
 * El nombre que se muestra es el de Magnus (Ped_Usu_Arma) cuando el catálogo
 * responde; si el servicio de ventas no está disponible se cae al nombre del
 * legajo, así el filtro sigue funcionando.
 */
export async function listarVendedoresActivos(): Promise<VendedorActivo[]> {
  const usuarios = await prisma.usuario.findMany({
    where: {
      activo: true,
      NOT: { vendedorCodigo: null },
      legajo: {
        estado: "ACTIVO",
        OR: [
          ...SECTORES_VENDEDORES.map((tokens) => ({
            AND: tokens.map((t) => ({
              sector: { contains: t, mode: "insensitive" as const },
            })),
          })),
          {
            sectorRel: {
              is: {
                OR: SECTORES_VENDEDORES.map((tokens) => ({
                  AND: tokens.map((t) => ({
                    nombre: { contains: t, mode: "insensitive" as const },
                  })),
                })),
              },
            },
          },
        ],
      },
    },
    select: {
      vendedorCodigo: true,
      nombre: true,
      legajo: { select: { nombre: true } },
    },
  });

  // Catálogo de Magnus para el nombre "oficial" del vendedor. Best-effort:
  // si falla, se usa el nombre del legajo.
  const nombresMagnus = new Map<number, string | null>();
  try {
    const res = await fetch(`${API_URL}/vendedores`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const j = await res.json();
      for (const v of j?.vendedores ?? []) {
        if (v?.codigo != null) nombresMagnus.set(Number(v.codigo), v.nombre ?? null);
      }
    }
  } catch {
    // sin catálogo: seguimos con los nombres del legajo
  }

  const porCodigo = new Map<number, VendedorActivo>();
  for (const u of usuarios) {
    const codigo = Number(u.vendedorCodigo);
    if (!Number.isInteger(codigo)) continue;
    if (porCodigo.has(codigo)) continue;
    porCodigo.set(codigo, {
      codigo,
      nombre: nombresMagnus.get(codigo) ?? u.legajo?.nombre ?? u.nombre ?? null,
    });
  }

  return [...porCodigo.values()].sort((a, b) =>
    (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"),
  );
}
