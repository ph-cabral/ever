import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Row = {
  employee_no: string;
  employee_name: string | null;
  departamento: string | null;
  fecha: string;
  check_in: string | null;
  check_out: string | null;
  minutos: number | null;
  eventos_dia: number | null;
  devices: string;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const employee_no = searchParams.get("employee_no");

    if (!desde || !hasta) {
      return NextResponse.json(
        { error: "desde y hasta son obligatorios (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const desdeTs = `${desde}T00:00:00-03:00`;
    const hastaTs = `${hasta}T23:59:59-03:00`;

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      WITH ev AS (
        SELECT
          e.employee_no,
          COALESCE(NULLIF(TRIM(l.nombre), ''), e.employee_name) AS employee_name,
          l.sector AS departamento,
          e.device,
          (e.event_time AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
          e.event_time
        FROM asistencia.evento e
        LEFT JOIN everwear.legajo l ON l."employeeNo" = e.employee_no
        WHERE e.event_time BETWEEN $1::timestamptz AND $2::timestamptz
          ${employee_no ? "AND e.employee_no = $3" : ""}
      )
      SELECT
        employee_no,
        (array_agg(employee_name) FILTER (WHERE employee_name IS NOT NULL))[1] AS employee_name,
        (array_agg(departamento)  FILTER (WHERE departamento  IS NOT NULL))[1] AS departamento,
        to_char(fecha, 'YYYY-MM-DD') AS fecha,
        string_agg(DISTINCT device, ',' ORDER BY device) AS devices,
        MIN(event_time) AS check_in,
        CASE WHEN COUNT(*) > 1 THEN MAX(event_time) ELSE NULL END AS check_out,
        CASE
          WHEN COUNT(*) > 1
            THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (MAX(event_time) - MIN(event_time))) / 60)::int)
          ELSE 0
        END AS minutos,
        COUNT(*)::int AS eventos_dia
      FROM ev
      GROUP BY employee_no, fecha
      ORDER BY (array_agg(employee_name) FILTER (WHERE employee_name IS NOT NULL))[1] NULLS LAST,
               fecha
      `,
      desdeTs,
      hastaTs,
      ...(employee_no ? [employee_no] : []),
    );

    const fmt = (d: Date | null) => (d ? d.toISOString() : null);

    const out: Row[] = rows.map((r) => ({
      employee_no: r.employee_no,
      employee_name: r.employee_name ?? null,
      departamento: r.departamento ?? null,
      fecha: r.fecha,
      check_in: fmt(r.check_in),
      check_out: fmt(r.check_out),
      minutos: r.minutos,
      eventos_dia: r.eventos_dia,
      devices: r.devices,
    }));

    return NextResponse.json(out);
  } catch (e: any) {
    console.error("[resumen]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
