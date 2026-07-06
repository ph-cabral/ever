import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/faltantes — marca "descartar" por (fecha, artículo).
//   POST { fecha: "YYYY-MM-DD", codArticulo, descartado? }  (default true)
//   No borra nada de la base: solo guarda la marca. faltantes-consumo la lee
//   (best-effort) y excluye esos buckets de la respuesta, así la fila no
//   aparece en ninguna tabla de la vista.
//   Tabla: preparado.faltante_descartado (prisma/sql/faltante_descartado.sql).
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const fecha = body?.fecha;
  const codArticulo = body?.codArticulo;
  if (!fecha || typeof fecha !== "string" || !codArticulo || typeof codArticulo !== "string") {
    return NextResponse.json({ error: "fecha y codArticulo son requeridos" }, { status: 400 });
  }
  const descartado = body?.descartado === false ? false : true;

  try {
    await prisma.$executeRaw`
      INSERT INTO preparado.faltante_descartado
        (fecha, "codArticulo", descartado, "updatedAt")
      VALUES (${fecha}::date, ${codArticulo}, ${descartado}, now())
      ON CONFLICT (fecha, "codArticulo") DO UPDATE SET
        descartado  = EXCLUDED.descartado,
        "updatedAt" = now()
    `;
    return NextResponse.json({ ok: true, fecha, codArticulo, descartado });
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo guardar la marca (¿falta aplicar faltante_descartado.sql?)", detail: String(e) },
      { status: 503 },
    );
  }
}
