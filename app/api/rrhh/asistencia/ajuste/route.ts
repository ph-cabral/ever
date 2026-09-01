import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Ajuste manual de ingreso/egreso (ver sql/asistencia_ajuste_manual.sql).
// Sólo un ADMIN puede cargarlo (2026-07-29) — a diferencia
// de estado_diario/novedad_diaria, que cualquiera con acceso a la vista puede
// editar.
// check_in / check_out: ISO 8601 con offset (ej. "2026-07-29T08:15:00-03:00").
// Enviar la clave con null borra ese lado puntual (vuelve al fichaje real);
// NO enviar la clave deja ese lado como está (permite editar un solo campo
// sin pisar el otro ajuste ya guardado).
type Body = {
  employee_no?: string;
  fecha?: string; // YYYY-MM-DD
  check_in?: string | null;
  check_out?: string | null;
};

export async function PATCH(req: NextRequest) {
  try {
    const g = await requireAdmin();
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

    const body: Body = await req.json();
    const { employee_no, fecha } = body;

    if (!employee_no || !fecha) {
      return NextResponse.json(
        { error: "employee_no y fecha son obligatorios" },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json(
        { error: "fecha debe tener formato YYYY-MM-DD" },
        { status: 400 },
      );
    }

    const hasCheckIn = Object.prototype.hasOwnProperty.call(body, "check_in");
    const hasCheckOut = Object.prototype.hasOwnProperty.call(body, "check_out");

    if (!hasCheckIn && !hasCheckOut) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Traigo el ajuste existente para no pisar el lado que no vino en el body
    // (editar sólo el egreso no debe borrar un ingreso ya cargado, y viceversa).
    const existing = await prisma.$queryRaw<
      { check_in: Date | null; check_out: Date | null }[]
    >`
      SELECT check_in, check_out FROM asistencia.ajuste_manual
      WHERE employee_no = ${employee_no} AND fecha = ${fecha}::date
    `;
    const prev = existing[0] ?? { check_in: null, check_out: null };

    const checkIn = hasCheckIn ? (body.check_in ?? null) : prev.check_in;
    const checkOut = hasCheckOut ? (body.check_out ?? null) : prev.check_out;

    if (checkIn == null && checkOut == null) {
      // Sin nada cargado -> borro el ajuste (vuelve a depender del fichaje real).
      await prisma.$executeRaw`
        DELETE FROM asistencia.ajuste_manual
        WHERE employee_no = ${employee_no} AND fecha = ${fecha}::date
      `;
      return NextResponse.json({ ok: true, deleted: true });
    }

    await prisma.$executeRaw`
      INSERT INTO asistencia.ajuste_manual (employee_no, fecha, check_in, check_out, updated_at)
      VALUES (${employee_no}, ${fecha}::date, ${checkIn}::timestamptz, ${checkOut}::timestamptz, now())
      ON CONFLICT (employee_no, fecha) DO UPDATE SET
        check_in   = EXCLUDED.check_in,
        check_out  = EXCLUDED.check_out,
        updated_at = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[ajuste PATCH]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
