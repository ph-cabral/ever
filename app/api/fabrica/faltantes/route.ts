import { NextRequest } from "next/server";
import { GET as comprasGET } from "@/app/api/compras/faltantes-consumo/route";

// Mismo GET de /api/compras/faltantes-consumo — cero lógica duplicada, mismo
// cálculo (faltantes × OC × stock). Existe como ruta propia solo para quedar
// bajo el prefijo "/api/fabrica" y así gatear por el módulo "manguera" en vez
// de "compras" (ver lib/auth/modules.ts) — así un usuario de fábrica (que por
// defecto solo tiene el módulo "manguera") puede pegarle a este endpoint sin
// necesitar permiso de "compras".
//
// 2026-08-28: fuerza fabril=1. Las OC de producción interna (PRODUCCION
// HIDRAULICA / FUNDICION, artículos tipo "Fabril") salieron de compras y
// ventas — no son compra a proveedor — y quedan SOLO en esta vista.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  url.searchParams.set("fabril", "1");
  return comprasGET(new NextRequest(url, { headers: req.headers }));
}
