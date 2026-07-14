// Reexporta el mismo GET de /api/compras/faltantes-consumo — cero lógica
// duplicada, mismo cálculo (faltantes × OC × stock). Existe como ruta propia
// solo para quedar bajo el prefijo "/api/fabrica" y así gatear por el módulo
// "manguera" en vez de "compras" (ver lib/auth/modules.ts) — así un usuario
// de fábrica (que por defecto solo tiene el módulo "manguera") puede pegarle
// a este endpoint sin necesitar permiso de "compras".
export { GET } from "@/app/api/compras/faltantes-consumo/route";
