import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/faltantes — marca "extraordinario" / "comprar" por (fecha, artículo).
//   POST { fecha: "YYYY-MM-DD", codArticulo, extraordinario?, comprar? }
//   El cliente manda el estado completo deseado (no un delta): faltantes-consumo
//   ya devuelve el valor actual de ambos flags en cada row.
//   Tabla: preparado.faltante_extraordinario (prisma/sql/faltante_extraordinario.sql).
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const fecha = body?.fecha;
  const codArticulo = body?.codArticulo;
  if (!fecha || typeof fecha !== "string" || !codArticulo || typeof codArticulo !== "string") {
    return NextResponse.json({ error: "fecha y codArticulo son requeridos" }, { status: 400 });
  }
  const extraordinario = !!body?.extraordinario;
  const comprar = !!body?.comprar;

  try {
    await prisma.$executeRaw`
      INSERT INTO preparado.faltante_extraordinario
        (fecha, "codArticulo", extraordinario, comprar, "updatedAt")
      VALUES (${fecha}::date, ${codArticulo}, ${extraordinario}, ${comprar}, now())
      ON CONFLICT (fecha, "codArticulo") DO UPDATE SET
        extraordinario = EXCLUDED.extraordinario,
        comprar        = EXCLUDED.comprar,
        "updatedAt"    = now()
    `;
    return NextResponse.json({ ok: true, fecha, codArticulo, extraordinario, comprar });
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo guardar la marca (¿falta aplicar faltante_extraordinario.sql?)", detail: String(e) },
      { status: 503 },
    );
  }
}
