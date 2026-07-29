import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Feriados / días no laborables (asistencia.feriado, ver
// sql/asistencia_feriados.sql). Se usan en resumen/route.ts para que el
// estado calculado por defecto muestre "Feriado" en vez de "Ausente".

// GET: lista de fechas (YYYY-MM-DD) marcadas como feriado dentro de [desde,hasta].
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");

    if (!desde || !hasta) {
      return NextResponse.json(
        { error: "desde y hasta son obligatorios (YYYY-MM-DD)" },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      return NextResponse.json(
        { error: "desde y hasta deben tener formato YYYY-MM-DD" },
        { status: 400 },
      );
    }

    // to_char evita el corrimiento de un día que da un DATE de Postgres
    // interpretado como Date de JS (UTC) y leído en hora local.
    const rows = await prisma.$queryRaw<{ fecha: string }[]>`
      SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha
      FROM asistencia.feriado
      WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date
      ORDER BY fecha
    `;

    return NextResponse.json(rows.map((r) => r.fecha));
  } catch (e: any) {
    console.error("[feriados GET]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

type Body = { fecha?: string; activo?: boolean };

// PATCH: togglea un día puntual. activo=true lo marca feriado, activo=false lo saca.
export async function PATCH(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { fecha, activo } = body;

    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json(
        { error: "fecha es obligatoria (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    if (activo) {
      await prisma.$executeRaw`
        INSERT INTO asistencia.feriado (fecha) VALUES (${fecha}::date)
        ON CONFLICT (fecha) DO NOTHING
      `;
    } else {
      await prisma.$executeRaw`
        DELETE FROM asistencia.feriado WHERE fecha = ${fecha}::date
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[feriados PATCH]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
