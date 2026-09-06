import { NextRequest, NextResponse } from "next/server";
import { resolverAccesoVickiVentas } from "@/lib/ventas/vickiVentasAcceso";

export const dynamic = "force-dynamic";

const VICKI_URL = process.env.VICKI_API_URL ?? "http://chat-agent:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Acceso a datos de ventas (intent "ventas" en vicki_chat): se resuelve
    // ACÁ, server-side contra la cookie de sesión, y se pisa lo que haya
    // mandado el browser en el body. vicki_chat confía en estos campos
    // porque vienen de este backend, nunca del cliente — si se leyeran del
    // body tal cual, cualquiera podría mandar `vendedorCodigo` de otra
    // persona. Ver lib/ventas/vickiVentasAcceso.ts.
    const acceso = await resolverAccesoVickiVentas();
    if (!acceso.ok) {
      return NextResponse.json({ error: acceso.error }, { status: acceso.status });
    }
    body.vicki_ventas_habilitado = acceso.habilitado;
    body.vicki_ventas_admin = acceso.isAdmin;
    body.vicki_ventas_vendedor_codigo = acceso.habilitado ? acceso.vendedorCodigo : null;

    const r = await fetch(`${VICKI_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    const txt = await r.text();
    return new NextResponse(txt, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Error de conexión a Vicki" },
      { status: 502 },
    );
  }
}
