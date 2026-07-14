// Reexporta el POST de /api/compras/faltantes-descartar (misma tabla
// preparado.faltante_descartado, no depende de proveedor). Bajo "/api/fabrica"
// para gatear por el módulo "manguera".
export { POST } from "@/app/api/compras/faltantes-descartar/route";
