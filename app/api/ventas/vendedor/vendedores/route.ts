import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { listarVendedoresActivos } from "@/lib/ventas/vendedoresActivos";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Vendedores activos para el FILTRO de admin de /ventas/vendedor (pedido de
// Pablo 2026-08-27). No es el catálogo completo de Magnus (eso es
// /api/admin/usuarios/vendedores, para asignar): acá sólo las personas con
// Estado_Desc "Habilitado" del maestro `Vendedores` — ver
// listarVendedoresActivos.
//
// Admin-only a propósito: el front lo usa además como "¿soy admin?" (403 =
// no se muestra el filtro), y un no-admin ya está acotado a su propio
// vendedor server-side (lib/ventas/vendedorAcceso.ts).
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    return NextResponse.json({ vendedores: await listarVendedoresActivos() });
  } catch (error) {
    console.error("GET /api/ventas/vendedor/vendedores", error);
    return NextResponse.json(
      { error: "No se pudo cargar la lista de vendedores" },
      { status: 500 },
    );
  }
}
