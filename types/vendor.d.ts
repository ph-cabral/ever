// pdf-parse no trae tipos y se importa por subpath (ver lib/rrhh/extraerTexto.ts:
// el index corre un harness de debug que lee un PDF del disco).
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult { text: string; numpages: number; info: unknown }
  const pdfParse: (data: Buffer | Uint8Array) => Promise<PdfParseResult>;
  export default pdfParse;
}
