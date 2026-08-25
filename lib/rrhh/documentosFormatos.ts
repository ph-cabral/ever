// Formatos aceptados al subir un documento a /rrhh/puestos.
// Archivo aparte de extraerTexto.ts a propósito: esto lo importa la página
// (client component) y extraerTexto.ts usa `path`/`mammoth`/`pdf-parse`, que
// no pueden entrar al bundle del browser.
export const EXT_SOPORTADAS = [".pdf", ".docx", ".txt", ".md", ".csv", ".xlsx", ".xls"];
export const ACCEPT = EXT_SOPORTADAS.join(",");
