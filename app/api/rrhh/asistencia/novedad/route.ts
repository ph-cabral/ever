import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Body = {
  employee_no?: string;
  fecha?: string; // YYYY-MM-DD
  kind?: "estado" | "novedad";
  value?: string | null;
  num?: string | number | null;
  bruto?: number | null; // minutos en empresa (snapshot)
  neto?: number | null; // minutos netos (snapshot)
};

const toInt = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

// Tope diario en minutos: viernes 480, fin de semana 0, resto 540.
const topeMin = (fecha: string): number => {
  const dow = new Date(`${fecha}T00:00:00`).getDay(); // 0 Dom .. 6 Sab
  if (dow === 5) return 480;
  if (dow === 0 || dow === 6) return 0;
  return 540;
};

export async function PATCH(req: NextRequest) {
  try {
    const { employee_no, fecha, kind, value, num, bruto, neto }: Body =
      await req.json();

    if (!employee_no || !fecha || (kind !== "estado" && kind !== "novedad")) {
      return NextResponse.json(
        {
          error: "employee_no, fecha y kind (estado|novedad) son obligatorios",
        },
        { status: 400 },
      );
    }

    const val = value && value.trim() !== "" ? value.trim() : null;
    const numInt = toInt(num);

    if (val == null && numInt == null) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    if (kind === "estado") {
      await prisma.$executeRaw`
        INSERT INTO asistencia.estado_diario (employee_no, fecha, estado, dias, updated_at)
        VALUES (${employee_no}, ${fecha}::date, ${val}, ${numInt}, now())
        ON CONFLICT (employee_no, fecha)
        DO UPDATE SET estado = EXCLUDED.estado, dias = EXCLUDED.dias, updated_at = now()
      `;
    } else {
      const brutoInt = toInt(bruto);
      const netoInt = toInt(neto);
      const rrhhInt =
        netoInt == null ? null : Math.min(netoInt, topeMin(fecha));
      await prisma.$executeRaw`
        INSERT INTO asistencia.novedad_diaria
          (employee_no, fecha, novedad, horas, minutos_brutos, minutos_netos, minutos_rrhh, updated_at)
        VALUES (${employee_no}, ${fecha}::date, ${val}, ${numInt}, ${brutoInt}, ${netoInt}, ${rrhhInt}, now())
        ON CONFLICT (employee_no, fecha)
        DO UPDATE SET
          novedad        = EXCLUDED.novedad,
          horas          = EXCLUDED.horas,
          minutos_brutos = EXCLUDED.minutos_brutos,
          minutos_netos  = EXCLUDED.minutos_netos,
          minutos_rrhh   = EXCLUDED.minutos_rrhh,
          updated_at     = now()
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[novedad PATCH]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
