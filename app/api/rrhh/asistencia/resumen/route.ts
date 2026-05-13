// import { NextRequest, NextResponse } from "next/server";

// export const dynamic = "force-dynamic";

// const API = process.env.HIKVISION_API_URL ?? "http://hikvision-api:8000";
// const TOKEN = process.env.HIKVISION_API_TOKEN ?? "";

// export async function GET(req: NextRequest) {
//   const { searchParams } = new URL(req.url);
//   const qs = new URLSearchParams();
//   for (const k of ["desde", "hasta", "employee_no"]) {
//     const v = searchParams.get(k);
//     if (v) qs.set(k, v);
//   }
//   const r = await fetch(`${API}/resumen?${qs}`, {
//     headers: TOKEN ? { "x-token": TOKEN } : {},
//     cache: "no-store",
//   });
//   if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
//   return NextResponse.json(await r.json());
// }

// import { NextRequest, NextResponse } from "next/server";
// import { prisma } from "@/lib/prisma";

// export const dynamic = "force-dynamic";

// type Row = {
//   employee_no: string;
//   employee_name: string | null;
//   fecha: string; // YYYY-MM-DD
//   check_in: string | null; // ISO con offset AR
//   check_out: string | null;
//   minutos: number | null;
//   eventos_dia: number | null;
//   devices: string; // == device (legacy: el front filtra por este campo)
// };

// export async function GET(req: NextRequest) {
//   const { searchParams } = new URL(req.url);
//   const desde = searchParams.get("desde");
//   const hasta = searchParams.get("hasta");
//   const employee_no = searchParams.get("employee_no");

//   if (!desde || !hasta) {
//     return NextResponse.json(
//       { error: "desde y hasta son obligatorios (YYYY-MM-DD)" },
//       { status: 400 },
//     );
//   }

//   // Rango AR → ventana UTC [desde 00:00 AR, hasta 23:59:59 AR]
//   // Postgres compara TIMESTAMPTZ correctamente sin importar la zona del cliente.
//   const desdeTs = `${desde}T00:00:00-03:00`;
//   const hastaTs = `${hasta}T23:59:59-03:00`;

//   // Agrupa en SQL: una fila por (empleado, día AR, reloj).
//   // - check_in  = primer evento del grupo
//   // - check_out = último evento si hay ≥ 2 marcas; null si hay solo 1
//   // - minutos   = (check_out - check_in) en minutos; 0 si falta alguno
//   // - employee_name = el primer nombre no nulo encontrado en el grupo
//   const rows = await prisma.$queryRawUnsafe<any[]>(
//     `
//     WITH ev AS (
//       SELECT
//         employee_no,
//         employee_name,
//         device,
//         (event_time AT TIME ZONE 'America/Argentina/Buenos_Aires')::date  AS fecha,
//         event_time
//       FROM asistencia.evento
//       WHERE event_time BETWEEN $1::timestamptz AND $2::timestamptz
//         ${employee_no ? "AND employee_no = $3" : ""}
//     )
//     SELECT
//       employee_no,
//       (array_agg(employee_name) FILTER (WHERE employee_name IS NOT NULL))[1] AS employee_name,
//       to_char(fecha, 'YYYY-MM-DD')                                            AS fecha,
//       device                                                                  AS devices,
//       MIN(event_time)                                                         AS check_in,
//       CASE WHEN COUNT(*) > 1 THEN MAX(event_time) ELSE NULL END               AS check_out,
//       CASE
//         WHEN COUNT(*) > 1
//           THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (MAX(event_time) - MIN(event_time))) / 60)::int)
//         ELSE 0
//       END                                                                     AS minutos,
//       COUNT(*)::int                                                           AS eventos_dia
//     FROM ev
//     GROUP BY employee_no, fecha, device
//     ORDER BY (array_agg(employee_name) FILTER (WHERE employee_name IS NOT NULL))[1] NULLS LAST,
//              fecha, device
//     `,
//     desdeTs,
//     hastaTs,
//     ...(employee_no ? [employee_no] : []),
//   );

//   // Prisma raw devuelve Date para timestamps; serializo a ISO AR para el front.
//   const fmt = (d: Date | null) => (d ? d.toISOString() : null);

//   const out: Row[] = rows.map((r) => ({
//     employee_no: r.employee_no,
//     employee_name: r.employee_name ?? null,
//     fecha: r.fecha,
//     check_in: fmt(r.check_in),
//     check_out: fmt(r.check_out),
//     minutos: r.minutos,
//     eventos_dia: r.eventos_dia,
//     devices: r.devices,
//   }));

//   return NextResponse.json(out);
// }ç


// import { NextRequest, NextResponse } from "next/server";

// export const dynamic = "force-dynamic";

// const API = process.env.HIKVISION_API_URL ?? "http://hikvision-api:8000";
// const TOKEN = process.env.HIKVISION_API_TOKEN ?? "";

// export async function GET(req: NextRequest) {
//   const { searchParams } = new URL(req.url);
//   const qs = new URLSearchParams();
//   for (const k of ["desde", "hasta", "employee_no"]) {
//     const v = searchParams.get(k);
//     if (v) qs.set(k, v);
//   }
//   const r = await fetch(`${API}/resumen?${qs}`, {
//     headers: TOKEN ? { "x-token": TOKEN } : {},
//     cache: "no-store",
//   });
//   if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
//   return NextResponse.json(await r.json());
// }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Row = {
  employee_no: string;
  employee_name: string | null;
  departamento: string | null;
  fecha: string; // YYYY-MM-DD
  check_in: string | null; // ISO con offset AR
  check_out: string | null;
  minutos: number | null;
  eventos_dia: number | null;
  devices: string; // == device (legacy: el front filtra por este campo)
};

export async function GET(req: NextRequest) {
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

  // Rango AR → ventana UTC [desde 00:00 AR, hasta 23:59:59 AR]
  // Postgres compara TIMESTAMPTZ correctamente sin importar la zona del cliente.
  const desdeTs = `${desde}T00:00:00-03:00`;
  const hastaTs = `${hasta}T23:59:59-03:00`;

  // Agrupa en SQL: una fila por (empleado, día AR, reloj).
  // - check_in  = primer evento del grupo
  // - check_out = último evento si hay ≥ 2 marcas; null si hay solo 1
  // - minutos   = (check_out - check_in) en minutos; 0 si falta alguno
  // - employee_name = el primer nombre no nulo encontrado en el grupo
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    WITH ev AS (
      SELECT
        e.employee_no,
        COALESCE(p.nombre, e.employee_name)              AS employee_name,
        p.departamento                                   AS departamento,
        e.device,
        (e.event_time AT TIME ZONE 'America/Argentina/Buenos_Aires')::date  AS fecha,
        e.event_time
      FROM asistencia.evento e
      LEFT JOIN asistencia.persona p ON p.employee_no = e.employee_no
      WHERE e.event_time BETWEEN $1::timestamptz AND $2::timestamptz
        ${employee_no ? "AND e.employee_no = $3" : ""}
    )
    SELECT
      employee_no,
      (array_agg(employee_name) FILTER (WHERE employee_name IS NOT NULL))[1]                       AS employee_name,
      (array_agg(departamento)  FILTER (WHERE departamento  IS NOT NULL))[1]                       AS departamento,
      to_char(fecha, 'YYYY-MM-DD')                                                                  AS fecha,
      string_agg(DISTINCT device, ',' ORDER BY device)                                              AS devices,
      MIN(event_time)                                                                               AS check_in,
      CASE WHEN COUNT(*) > 1 THEN MAX(event_time) ELSE NULL END                                     AS check_out,
      CASE
        WHEN COUNT(*) > 1
          THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (MAX(event_time) - MIN(event_time))) / 60)::int)
        ELSE 0
      END                                                                                           AS minutos,
      COUNT(*)::int                                                                                 AS eventos_dia
    FROM ev
    GROUP BY employee_no, fecha
    ORDER BY (array_agg(employee_name) FILTER (WHERE employee_name IS NOT NULL))[1] NULLS LAST,
             fecha
    `,
    desdeTs,
    hastaTs,
    ...(employee_no ? [employee_no] : []),
  );

  // Prisma raw devuelve Date para timestamps; serializo a ISO AR para el front.
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
}