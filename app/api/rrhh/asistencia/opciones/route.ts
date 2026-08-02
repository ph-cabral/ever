import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export type Opcion = {
  id: number;
  tipo: "estado" | "novedad";
  nombre: string;
  genera_calendario: boolean;
  orden: number;
  activo: boolean;
};

// GET: lista completa (estado + novedad) — reemplaza a los arrays ESTADOS/
// NOVEDADES que antes estaban hardcodeados en page.tsx. Cualquiera con
// acceso a la vista puede leerla (mismo criterio que /horarios).
export async function GET() {
  try {
    const opciones = await prisma.$queryRawUnsafe<Opcion[]>(
      `SELECT id, tipo, nombre, genera_calendario, orden, activo
       FROM asistencia.opcion
       WHERE activo = true
       ORDER BY tipo, orden, id`,
    );
    return NextResponse.json({ opciones });
  } catch (e: any) {
    console.error("[opciones GET]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

type PatchBody = {
  id?: number;
  genera_calendario?: boolean;
  activo?: boolean;
};

// PATCH: togglear genera_calendario (ícono de calendario en cada ladrillo) o
// desactivar una opción. Sólo ADMIN — cambia una config que ve todo el
// equipo, mismo criterio que el ajuste manual de horario.
export async function PATCH(req: NextRequest) {
  try {
    const g = await requireAdmin();
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

    const body: PatchBody = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id es obligatorio" }, { status: 400 });
    }
    const sets: string[] = [];
    const vals: any[] = [];
    if (typeof body.genera_calendario === "boolean") {
      sets.push(`genera_calendario = $${sets.length + 1}`);
      vals.push(body.genera_calendario);
    }
    if (typeof body.activo === "boolean") {
      sets.push(`activo = $${sets.length + 1}`);
      vals.push(body.activo);
    }
    if (sets.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    sets.push(`updated_at = now()`);
    vals.push(body.id);
    await prisma.$executeRawUnsafe(
      `UPDATE asistencia.opcion SET ${sets.join(", ")} WHERE id = $${vals.length}`,
      ...vals,
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[opciones PATCH]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

type PostBody = {
  tipo?: "estado" | "novedad";
  nombre?: string;
};

// POST: agregar una opción nueva (ej. un estado/novedad que todavía no
// existía) — sólo ADMIN, aparece al final de la grilla de ladrillos.
export async function POST(req: NextRequest) {
  try {
    const g = await requireAdmin();
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

    const body: PostBody = await req.json();
    const tipo = body.tipo;
    const nombre = (body.nombre ?? "").trim();
    if (tipo !== "estado" && tipo !== "novedad") {
      return NextResponse.json({ error: "tipo debe ser estado|novedad" }, { status: 400 });
    }
    if (!nombre) {
      return NextResponse.json({ error: "nombre es obligatorio" }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(orden)::int AS max FROM asistencia.opcion WHERE tipo = ${tipo}
    `;
    const orden = (rows[0]?.max ?? 0) + 1;

    await prisma.$executeRaw`
      INSERT INTO asistencia.opcion (tipo, nombre, genera_calendario, orden)
      VALUES (${tipo}, ${nombre}, false, ${orden})
      ON CONFLICT (tipo, nombre) DO UPDATE SET activo = true
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[opciones POST]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
