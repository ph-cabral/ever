// Ruta duplicada histórica (no se pudo borrar desde acá por permisos).
// Re-exporta el handler real para no duplicar lógica ni romper el build.
// Se puede borrar manualmente: app/api/sorteo/sorteo/
export { GET, POST, DELETE, dynamic } from "../../album/route";
