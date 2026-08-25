// Texto indexable de un archivo subido a /rrhh/puestos.
//
// POR QUÉ EXISTE: lo único que Vicki embebe es la columna `contenido` del
// documento (ver vicki_chat/app/rag_ingest.py) — el adjunto en disco es solo
// para descargar el original. Antes ese texto se pegaba a mano en un textarea;
// desde que la carga es "subir el archivo y listo", el contenido sale de acá.
// Si esto devuelve vacío, el documento NO le sirve a Vicki.
import path from "path";
import { EXT_SOPORTADAS } from "@/lib/rrhh/documentosFormatos";

export { EXT_SOPORTADAS };

/** El archivo se pudo leer pero no tiene texto extraíble (formato no soportado). */
export class SinTextoError extends Error {}

function normalizar(t: string) {
  return (t ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extraerTexto(file: File): Promise<string> {
  const ext = path.extname(file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if ([".txt", ".md", ".csv"].includes(ext)) return normalizar(buf.toString("utf8"));

  if (ext === ".docx") {
    const mod = await import("mammoth");
    const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const { value } = await mammoth.extractRawText({ buffer: buf });
    // mammoth separa PÁRRAFOS con un solo "\n"; el chunker de rag_ingest.py
    // corta por "\n\n". Sin este re-armado el .docx entero entra como un
    // párrafo gigante y se parte por renglones repitiendo un encabezado que no
    // corresponde. Con esto cada párrafo del Word es un párrafo real.
    return normalizar(
      value.split("\n").map((l: string) => l.trim()).filter(Boolean).join("\n\n"),
    );
  }

  if (ext === ".pdf") {
    // Subpath a propósito: el index de pdf-parse trae un harness de debug que
    // lee un PDF de prueba del disco cuando no lo importa un CommonJS "padre"
    // → ENOENT ./test/data/05-versions-space.pdf dentro del contenedor.
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = (mod as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default;
    const { text } = await pdfParse(buf);
    return normalizar(text);
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    const hojas = wb.SheetNames.map((n) => `${n}\n\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`);
    return normalizar(hojas.join("\n\n"));
  }

  throw new SinTextoError(
    `No se puede leer el texto de "${ext || "un archivo sin extensión"}". Formatos aceptados: ${EXT_SOPORTADAS.join(", ")}. Si es un .doc viejo, guardalo como .docx o PDF.`,
  );
}
