import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Horas objetivo por mes (asistencia.horas_objetivo, ver
// sql/asistencia_horas_objetivo.sql). Un solo número por mes (ej. 300) contra
// el que se compara el total de horas RRHH acumuladas de cada empleado en
// /rrhh (pestaña Ausentismo), para marcar quién cumplió y quién no. Pedido de
// Pablo 2026-07-31.

// GET ?ym=YYYY-MM -> { horas: number | null }
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ym = searchParams.get("ym");
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
      return NextResponse.json(
        { error: "ym es obligatorio (YYYY-MM)" },
        { status: 400 },
      );
    }

    const rows = await prisma.$queryRaw<{ horas_objetivo: number }[]>`
      SELECT horas_objetivo FROM asistencia.horas_objetivo WHERE ym = ${ym}
    `;

    return NextResponse.json({ horas: rows[0]?.horas_objetivo ?? null });
  } catch (e: any) {
    console.error("[horas-objetivo GET]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

type Body = { ym?: string; horas?: number | string | null };

// PATCH { ym, horas } -> upsert. horas null/0/vacío borra el objetivo del mes.
export async function PATCH(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const ym = body.ym ?? "";
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      return NextResponse.json(
        { error: "ym es obligatorio (YYYY-MM)" },
        { status: 400 },
      );
    }

    const horas = Number(body.horas);
    if (!Number.isFinite(horas) || horas <= 0) {
      await prisma.$executeRaw`
        DELETE FROM asistencia.horas_objetivo WHERE ym = ${ym}
      `;
      return NextResponse.json({ ok: true, deleted: true });
    }

    await prisma.$executeRaw`
      INSERT INTO asistencia.horas_objetivo (ym, horas_objetivo, updated_at)
      VALUES (${ym}, ${Math.trunc(horas)}, now())
      ON CONFLICT (ym) DO UPDATE SET
        horas_objetivo = EXCLUDED.horas_objetivo, updated_at = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[horas-objetivo PATCH]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
