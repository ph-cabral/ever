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
//   const r = await fetch(`${API}/eventos?${qs}`, {
//     headers: TOKEN ? { "x-token": TOKEN } : {},
//     cache: "no-store",
//   });
//   if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
//   return NextResponse.json(await r.json());
// }

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

  // Acepta tanto "YYYY-MM-DD" como ISO completo. Si viene fecha pelada,
  // expando a ventana AR del día completo.
  const desdeTs = desde.length === 10 ? `${desde}T00:00:00-03:00` : desde;
  const hastaTs = hasta.length === 10 ? `${hasta}T23:59:59-03:00` : hasta;

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      device,
      employee_no,
      employee_name,
      event_time,
      tipo,
      major,
      minor
    FROM asistencia.evento
    WHERE event_time BETWEEN $1::timestamptz AND $2::timestamptz
      ${employee_no ? "AND employee_no = $3" : ""}
    ORDER BY employee_name NULLS LAST, event_time
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
  }));

  return NextResponse.json(out);
}