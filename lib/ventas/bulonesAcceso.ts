import { resolverAccesoVendedor, type AccesoVendedor } from "./vendedorAcceso";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

/**
 * Acceso por vendedor de /ventas/bulones (pedido de Gustavo 2026-08-27).
 *
 * Regla general: la misma que /ventas/vendedor — un no-admin sólo ve SU
 * cartera (ver resolverAccesoVendedor). EXCEPCIÓN: hay vendedores que en la
 * vista de BULONERÍA tienen que ver el 100% de la consulta (toda la
 * empresa), porque manejan la línea entera y no una cartera. Hoy es Julio
 * Blanco.
 *
 * La excepción es SÓLO para /ventas/bulones: en /ventas/vendedor y en el
 * resto de la app esos usuarios siguen viendo únicamente su cartera (por eso
 * esto vive en un archivo aparte y no dentro de resolverAccesoVendedor).
 *
 * Se identifica por NOMBRE contra el catálogo de Magnus
 * (Ped_Usu_Arma.Usu_Arma_Nombre, vía indicadores-api /vendedores), no por un
 * código hardcodeado: el código de Ped_Usu_Arma no es estable entre entornos
 * y a nadie le dice nada leyéndolo. La comparación normaliza mayúsculas,
 * acentos, puntuación y ORDEN de las palabras, así que "Blanco Julio Cesar"
 * y "julio cesar blanco" son la misma persona. OJO: el match es por
 * conjunto EXACTO de palabras — el nombre de acá tiene que ser el nombre
 * completo tal cual está cargado en Magnus, ni de más ni de menos
 * ("JULIO BLANCO" NO matchea "Blanco Julio Cesar").
 *
 * Para agregar o sacar gente sin tocar código: variable de entorno
 * BULONES_VENDEDORES_ACCESO_TOTAL con los nombres separados por coma
 * (ej. "BLANCO JULIO CESAR, VACA MARCELA"). Si no está definida, se usa el valor
 * por defecto de abajo.
 */
// Tal cual figura en Ped_Usu_Arma.Usu_Arma_Nombre: "Blanco Julio Cesar".
const NOMBRES_POR_DEFECTO = "BLANCO JULIO CESAR";

/** Mayúsculas sin acentos ni puntuación, palabras ordenadas alfabéticamente. */
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

function nombresConAccesoTotal(): Set<string> {
  const crudo = process.env.BULONES_VENDEDORES_ACCESO_TOTAL ?? NOMBRES_POR_DEFECTO;
  const out = new Set<string>();
  for (const parte of crudo.split(/[,;|]/)) {
    const n = normalizarNombre(parte);
    if (n) out.add(n);
  }
  return out;
}

// Catálogo de vendedores cacheado en memoria: es chico (decenas de filas) y
// pega contra SQL Server. Sin esto, cada request de /ventas/bulones sumaría
// una consulta a Magnus sólo para saber el nombre del vendedor logueado.
type VendedorCatalogo = { codigo: number; nombre: string | null };
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; porCodigo: Map<number, string> } | null = null;

async function catalogoVendedores(): Promise<Map<number, string> | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.porCodigo;
  try {
    const res = await fetch(`${API_URL}/vendedores`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return cache?.porCodigo ?? null;
    const data = (await res.json()) as { vendedores?: VendedorCatalogo[] };
    const porCodigo = new Map<number, string>();
    for (const v of data.vendedores ?? []) {
      if (v?.codigo == null || !v.nombre) continue;
      porCodigo.set(Number(v.codigo), String(v.nombre));
    }
    cache = { at: Date.now(), porCodigo };
    return porCodigo;
  } catch (error) {
    console.error("bulonesAcceso: no se pudo leer el catálogo de vendedores", error);
    // Si el catálogo no responde se usa el último conocido; si nunca hubo,
    // null → se cae al filtro normal (fail-closed: mejor ver de menos que
    // abrir la cartera de otro por un error de red).
    return cache?.porCodigo ?? null;
  }
}

export async function tieneAccesoTotalBulones(vendedorCodigo: number): Promise<boolean> {
  const nombres = nombresConAccesoTotal();
  if (nombres.size === 0) return false;
  const porCodigo = await catalogoVendedores();
  const nombre = porCodigo?.get(vendedorCodigo);
  if (!nombre) return false;
  return nombres.has(normalizarNombre(nombre));
}

/**
 * Igual que resolverAccesoVendedor(), pero devuelve `isAdmin: true` (= sin
 * filtro de cartera) también para los vendedores de la lista de arriba.
 * Usarlo SÓLO en las rutas de /api/ventas/bulones.
 */
export async function resolverAccesoBulones(): Promise<AccesoVendedor> {
  const acceso = await resolverAccesoVendedor();
  if (!acceso.ok) return acceso;
  if (acceso.isAdmin) return acceso;
  if (!acceso.vendedorCodigo) return acceso;
  if (await tieneAccesoTotalBulones(acceso.vendedorCodigo)) {
    return { ok: true, isAdmin: true, vendedorCodigo: null };
  }
  return acceso;
}
