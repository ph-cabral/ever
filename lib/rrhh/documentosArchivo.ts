// Adjunto original de un documento de /rrhh/puestos: dónde se guarda y cómo
// se nombra. Vive acá (y no dentro de la route de archivo) porque desde que la
// carga es "subir el archivo", el POST de /api/rrhh/documentos también escribe
// el archivo en el mismo request que crea la fila.
//
// OJO: DOCUMENTOS_DIR tiene que ser un volumen ESCRIBIBLE en prod
// (docker-compose.prod.yml → ./documentos:/app/documentos, sin :ro).
import { promises as fs } from "fs";
import path from "path";

export const DIR = process.env.DOCUMENTOS_DIR || path.join(process.cwd(), "documentos");
export const MAX_BYTES = 20_000_000;

export const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Sin rutas ni caracteres raros → evita path traversal. */
export function safeName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._ ()-]/g, "_").slice(0, 150);
}

/** El título de un documento subido es el nombre del archivo sin la extensión. */
export function tituloDesdeArchivo(name: string) {
  return path.basename(name || "").replace(/\.[^.]+$/, "").trim();
}

export function rutaAdjunto(id: number, nombre: string) {
  return path.join(DIR, `${id}_${nombre}`);
}

/**
 * Escribe el adjunto en disco y devuelve el nombre guardado. Tira si el
 * directorio no es escribible — el que llama decide qué hacer con eso.
 */
export async function guardarArchivo(id: number, file: File, anterior?: string | null): Promise<string> {
  const nombre = safeName(file.name || `documento-${id}`);
  await fs.mkdir(DIR, { recursive: true });
  if (anterior && anterior !== nombre) {
    await fs.unlink(rutaAdjunto(id, anterior)).catch(() => {});
  }
  await fs.writeFile(rutaAdjunto(id, nombre), Buffer.from(await file.arrayBuffer()));
  return nombre;
}
