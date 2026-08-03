import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Libreta de emails para /rrhh/asistencia (asistencia.email_registrado, ver
// sql/asistencia_emails_registrados.sql) — pedido de Pablo (2026-08-03):
// panel para administrarla desde page.tsx + fuente del autocompletado de
// "invitados" en RegistroModal.tsx (step "calendario"). Sin gating de
// ADMIN, mismo criterio que /api/rrhh/asistencia/feriados.

export type EmailRegistrado = {
  id: number;
  email: string;
  nombre: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET: lista completa (activos), para el panel de admin y el autocompletado.
export async function GET() {
  try {
    const emails = await prisma.$queryRaw<EmailRegistrado[]>`
      SELECT id, email, nombre
      FROM asistencia.email_registrado
      WHERE activo = true
      ORDER BY COALESCE(NULLIF(TRIM(nombre), ''), email)
    `;
    return NextResponse.json({ emails });
  } catch (e: any) {
    console.error("[emails GET]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

type PostBody = { email?: string; nombre?: string };

// POST: agrega un email a la libreta (o lo reactiva si estaba borrado).
export async function POST(req: NextRequest) {
  try {
    const body: PostBody = await req.json();
    const email = (body.email ?? "").trim();
    const nombre = (body.nombre ?? "").trim() || null;

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "email inválido" }, { status: 400 });
    }

    const session = await getSession().catch(() => null);
    const creadoPor = session?.nombre ?? null;

    await prisma.$executeRaw`
      INSERT INTO asistencia.email_registrado (email, nombre, created_by)
      VALUES (${email}, ${nombre}, ${creadoPor})
      ON CONFLICT (email) DO UPDATE SET
        activo = true,
        nombre = COALESCE(EXCLUDED.nombre, asistencia.email_registrado.nombre)
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[emails POST]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

type DeleteBody = { id?: number };

// DELETE: saca un email de la libreta. Body { id }.
export async function DELETE(req: NextRequest) {
  try {
    const body: DeleteBody = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id es obligatorio" }, { status: 400 });
    }
    await prisma.$executeRaw`
      DELETE FROM asistencia.email_registrado WHERE id = ${body.id}
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[emails DELETE]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
