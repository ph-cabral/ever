// 24 jurisdicciones de Argentina (23 provincias + CABA). Sin deps de Node.

export const PROVINCIAS: string[] = [
  "Buenos Aires",
  "Ciudad Autónoma de Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

// Rango de marcas diacríticas combinantes (U+0300–U+036F). Se construye desde
// un string ASCII para no meter caracteres combinantes en el código fuente.
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICOS, "").trim();
}

/**
 * Devuelve el nombre canónico de provincia que mejor matchea un texto libre
 * (una dirección, el state_name de MercadoLibre, etc.) o null si no se puede.
 */
export function matchProvincia(texto?: string | null): string | null {
  if (!texto) return null;
  const t = normalizar(texto);
  // CABA primero: su nombre contiene "buenos aires" y si no se chequea antes
  // se confundiría con la provincia de Buenos Aires.
  if (/ciudad autonoma|capital federal|\bcaba\b/.test(t)) {
    return "Ciudad Autónoma de Buenos Aires";
  }
  for (const p of PROVINCIAS) {
    if (p === "Ciudad Autónoma de Buenos Aires") continue;
    if (t.includes(normalizar(p))) return p;
  }
  return null;
}
