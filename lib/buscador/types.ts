// Tipos compartidos del Buscador de clientes.
// SIN dependencias de Node: se importa tanto en el cliente (vista) como en el
// server (API y libs de fuentes).

export type Fuente = "google" | "mercadolibre" | "osm";

export type TipoContacto = "empresa" | "vendedor";

/** Registro unificado de un prospecto (empresa o vendedor) encontrado. */
export interface Prospecto {
  /** Clave estable para deduplicar (derivada de web / teléfono / nombre). */
  id: string;
  fuente: Fuente;
  tipo: TipoContacto;
  nombre: string;
  rubro: string | null; // categoría / tipo de negocio
  provincia: string | null;
  localidad: string | null;
  direccion: string | null;
  telefono: string | null;
  whatsapp: string | null; // número o link wa.me, si se encontró
  email: string | null;
  web: string | null;
  enlace: string | null; // ficha en Google Maps o publicación en ML
  precioDesde: number | null; // referencia de precio (ML)
  publicaciones: number | null; // cantidad de avisos del vendedor (ML)
  notas: string | null;
}

export interface BuscarParams {
  /** Artículo a buscar, ej. "poleas". */
  q: string;
  /** Provincia exacta (nombre canónico) o "todas". */
  provincia: string;
  fuentes: Fuente[];
  /** Intentar extraer email/WhatsApp visitando la web de cada empresa. */
  enriquecer: boolean;
  /** Antigüedad máxima de publicaciones (ML), en meses. */
  meses: number;
}

export interface BuscarMeta {
  q: string;
  provincia: string;
  total: number;
  porFuente: Record<Fuente, number>;
  enriquecidos: number;
  ms: number;
}

export interface BuscarResponse {
  results: Prospecto[];
  meta: BuscarMeta;
  /** Avisos no fatales: faltan credenciales, fuente caída, etc. */
  warnings: string[];
}

/** Columnas (orden y encabezado) usadas tanto en la tabla como en el Excel. */
export const COLUMNAS: { key: keyof Prospecto; label: string }[] = [
  { key: "nombre", label: "Nombre" },
  { key: "tipo", label: "Tipo" },
  { key: "rubro", label: "Rubro" },
  { key: "provincia", label: "Provincia" },
  { key: "localidad", label: "Localidad" },
  { key: "direccion", label: "Dirección" },
  { key: "telefono", label: "Teléfono" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "web", label: "Web" },
  { key: "enlace", label: "Enlace" },
  { key: "precioDesde", label: "Precio desde" },
  { key: "publicaciones", label: "Publicaciones" },
  { key: "fuente", label: "Fuente" },
];
