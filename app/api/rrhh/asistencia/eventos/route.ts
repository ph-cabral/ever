import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

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
  if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta)) {
    return NextResponse.json(
      { error: "desde/hasta deben ser YYYY-MM-DD o ISO 8601" },
      { status: 400 },
    );
  }

  const desdeTs = desde.length === 10 ? `${desde}T00:00:00-03:00` : desde;
  const hastaTs = hasta.length === 10 ? `${hasta}T23:59:59-03:00` : hasta;

  try {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    WITH match_no AS (
      -- Resuelve cada ID crudo del reloj al employeeNo real del legajo:
      --   1) match EXACTO si existe — nunca mezcla dos legajos que sólo
      --      difieren en ceros a la izquierda (ej. "40" vs "00000040" son
      --      personas DISTINTAS — bug reportado 2026-08-13: Boscacci
      --      Vladimir vs Pereyra Francisco quedaban fusionados).
      --   2) si no hay exacto, cae al match "sin ceros" SÓLO si es único
      --      entre los legajos — cubre el caso real donde un reloj devuelve
      --      el ID con padding distinto al del legajo para la MISMA persona.
      SELECT
        raw.employee_no AS raw_no,
        COALESCE(exacto."employeeNo", difuso."employeeNo") AS legajo_no
      FROM (
        SELECT DISTINCT e2.employee_no
        FROM asistencia.evento e2
        WHERE e2.event_time BETWEEN $1::timestamptz AND $2::timestamptz
      ) raw
      LEFT JOIN everwear.legajo exacto ON exacto."employeeNo" = raw.employee_no
      LEFT JOIN LATERAL (
        SELECT lg."employeeNo"
        FROM everwear.legajo lg
        WHERE exacto."employeeNo" IS NULL
          AND ltrim(lg."employeeNo", '0') = ltrim(raw.employee_no, '0')
          AND (
            SELECT COUNT(*) FROM everwear.legajo lg2
            WHERE ltrim(lg2."employeeNo", '0') = ltrim(lg."employeeNo", '0')
          ) = 1
        LIMIT 1
      ) difuso ON true
    )
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
    JOIN match_no mn ON mn.raw_no = e.employee_no
    LEFT JOIN everwear.legajo l ON l."employeeNo" = mn.legajo_no
    LEFT JOIN everwear.sector s ON s.id = l."sectorId"
    LEFT JOIN everwear.area   a ON a.id = s."areaId"
    WHERE e.event_time BETWEEN $1::timestamptz AND $2::timestamptz
      ${employee_no ? `AND (e.employee_no = $3 OR mn.legajo_no = $3)` : ""}
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
  } catch (e: any) {
    console.error("[asistencia/eventos]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}