import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const employee_no = searchParams.get("employee_no");

  if (!desde || !hasta) {
    return NextResponse.json(
      { error: "desde y hasta son obligatorios" },
      { status: 400 },
    );
  }

  const desdeTs = desde.length === 10 ? `${desde}T00:00:00-03:00` : desde;
  const hastaTs = hasta.length === 10 ? `${hasta}T23:59:59-03:00` : hasta;

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      e.device,
      e.employee_no,
      COALESCE(NULLIF(TRIM(l.nombre), ''), e.employee_name) AS employee_name,
      a.nombre AS area,
      e.event_time,
      e.tipo,
      e.major,
      e.minor
    FROM asistencia.evento e
    LEFT JOIN everwear.legajo l
      ON ltrim(l."employeeNo", '0') = ltrim(e.employee_no, '0')
    LEFT JOIN everwear.sector s ON s.id = l."sectorId"
    LEFT JOIN everwear.area   a ON a.id = s."areaId"
    WHERE e.event_time BETWEEN $1::timestamptz AND $2::timestamptz
      ${employee_no ? `AND ltrim(e.employee_no, '0') = ltrim($3, '0')` : ""}
    ORDER BY employee_name NULLS LAST, e.event_time
    `,
    desdeTs,
    hastaTs,
    ...(employee_no ? [employee_no] : []),
  );

  const out = rows.map((r) => ({
    device: r.device,
    employee_no: r.employee_no,
    employee_name: r.employee_name ?? null,
    event_time: (r.event_time as Date).toISOString(),
    tipo: r.tipo ?? null,
    major: r.major ?? null,
    minor: r.minor ?? null,
    area: r.area ?? null,
  }));

  return NextResponse.json(out);
}