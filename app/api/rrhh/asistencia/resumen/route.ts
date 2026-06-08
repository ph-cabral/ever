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
  devices: string | null;
  estado: string | null;
  dias: number | null;
  novedad: string | null;
  horas: number | null;
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

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      WITH bounds AS (
        SELECT ($1::date)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires' AS lo,
               (($2::date + 1)::timestamp) AT TIME ZONE 'America/Argentina/Buenos_Aires' AS hi
      ),
      dias AS (
        SELECT generate_series($1::date, $2::date, interval '1 day')::date AS fecha
      ),
      act AS (
        SELECT l."employeeNo" AS employee_no,
               ltrim(l."employeeNo", '0') AS emp_key,
               NULLIF(TRIM(l.nombre), '') AS employee_name,
               a.nombre AS departamento
        FROM everwear.legajo l
        LEFT JOIN everwear.sector s ON s.id = l."sectorId"
        LEFT JOIN everwear.area   a ON a.id = s."areaId"
        WHERE l.estado = 'ACTIVO' AND l."employeeNo" IS NOT NULL
        ${employee_no ? `AND ltrim(l."employeeNo", '0') = ltrim($3, '0')` : ""}
      ),
      ev AS (
        SELECT
          ltrim(e.employee_no, '0') AS emp_key,
          (e.event_time AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
          string_agg(DISTINCT e.device, ',' ORDER BY e.device) AS devices,
          MIN(e.event_time) AS check_in,
          CASE WHEN COUNT(*) > 1 THEN MAX(e.event_time) ELSE NULL END AS check_out,
          CASE
            WHEN COUNT(*) > 1
              THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (MAX(e.event_time) - MIN(e.event_time))) / 60)::int)
            ELSE 0
          END AS minutos,
          COUNT(*)::int AS eventos_dia
        FROM asistencia.evento e, bounds b
        WHERE e.event_time >= b.lo AND e.event_time < b.hi
        GROUP BY ltrim(e.employee_no, '0'), (e.event_time AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      )
      SELECT
        a.employee_no,
        a.employee_name,
        a.departamento,
        to_char(d.fecha, 'YYYY-MM-DD') AS fecha,
        ev.devices,
        ev.check_in,
        ev.check_out,
        COALESCE(ev.minutos, 0) AS minutos,
        COALESCE(ev.eventos_dia, 0) AS eventos_dia,
        ed.estado AS estado,
        ed.dias   AS dias,
        nd.novedad AS novedad,
        nd.horas   AS horas
      FROM dias d
      CROSS JOIN act a
      LEFT JOIN ev ON ev.emp_key = a.emp_key AND ev.fecha = d.fecha
      LEFT JOIN asistencia.estado_diario ed
        ON ed.employee_no = a.employee_no AND ed.fecha = d.fecha
      LEFT JOIN asistencia.novedad_diaria nd
        ON nd.employee_no = a.employee_no AND nd.fecha = d.fecha
      ORDER BY a.employee_name NULLS LAST, d.fecha
      `,
      desde,
      hasta,
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
      devices: r.devices ?? null,
      estado: r.estado ?? null,
      dias: r.dias ?? null,
      novedad: r.novedad ?? null,
      horas: r.horas ?? null,
    }));

    return NextResponse.json(out);
  } catch (e: any) {
    console.error("[resumen]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}