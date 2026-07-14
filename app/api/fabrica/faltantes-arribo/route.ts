// Reexporta el POST de /api/compras/faltantes-arribo (misma tabla
// preparado.faltante_control, fan-out por renglón). Bajo "/api/fabrica" para
// gatear por el módulo "manguera".
export { POST } from "@/app/api/compras/faltantes-arribo/route";
