import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type NovItem = { novedad: string; horas: number };

type Body = {
  employee_no?: string;
  fecha?: string; // YYYY-MM-DD
  kind?: "estado" | "novedad";
  value?: string | null; // estado: texto. (novedad legacy: texto único)
  num?: string | number | null; // estado: días. (novedad legacy: horas)
  items?: NovItem[]; // novedad: lista [{novedad, horas}]
  bruto?: number | null; // minutos en empresa (snapshot)
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

// Normaliza la lista de novedades (acepta items, o cae al legacy value/num).
const parseItems = (b: Body): NovItem[] => {
  const raw = Array.isArray(b.items)
    ? b.items
    : b.value && b.value.trim() !== ""
      ? [{ novedad: b.value, horas: Number(b.num) || 0 }]
      : [];
  return raw
    .map((it) => ({
      novedad: String(it.novedad ?? "").trim(),
      horas: Math.max(0, toInt(it.horas) ?? 0),
    }))
    .filter((it) => it.novedad !== "");
};

export async function PATCH(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { employee_no, fecha, kind, value, num, bruto } = body;

    if (!employee_no || !fecha || (kind !== "estado" && kind !== "novedad")) {
      return NextResponse.json(
        {
          error: "employee_no, fecha y kind (estado|novedad) son obligatorios",
        },
        { status: 400 },
      );
    }

    if (kind === "estado") {
      const val = value && value.trim() !== "" ? value.trim() : null;
      const numInt = toInt(num);
      if (val == null && numInt == null) {
        // Explícitamente vacío (botón "Quitar" del modal) -> borra la fila en
        // vez de no hacer nada, para que se pueda deshacer un estado ya
        // guardado (antes esto era un no-op silencioso).
        await prisma.$executeRaw`
          DELETE FROM asistencia.estado_diario
          WHERE employee_no = ${employee_no} AND fecha = ${fecha}::date
        `;
        return NextResponse.json({ ok: true, deleted: true });
      }
      await prisma.$executeRaw`
        INSERT INTO asistencia.estado_diario (employee_no, fecha, estado, dias, updated_at)
        VALUES (${employee_no}, ${fecha}::date, ${val}, ${numInt}, now())
        ON CONFLICT (employee_no, fecha)
        DO UPDATE SET estado = EXCLUDED.estado, dias = EXCLUDED.dias, updated_at = now()
      `;
      return NextResponse.json({ ok: true });
    }

    // ── kind === "novedad": lista de novedades con horas individuales ──────────
    const items = parseItems(body);

    // Sin novedades → borro la fila para no dejar registros vacíos.
    if (items.length === 0) {
      await prisma.$executeRaw`
        DELETE FROM asistencia.novedad_diaria
        WHERE employee_no = ${employee_no} AND fecha = ${fecha}::date
      `;
      return NextResponse.json({ ok: true, deleted: true });
    }

    const sumHoras = items.reduce((s, it) => s + (it.horas || 0), 0);
    const novedadesJson = JSON.stringify(items);
    const novedadLegacy = items.map((it) => it.novedad).join(", "); // compat lectura

    const brutoInt = toInt(bruto);
    const netoInt =
      brutoInt == null ? null : Math.max(0, brutoInt - sumHoras * 60);
    const rrhhInt = netoInt == null ? null : Math.min(netoInt, topeMin(fecha));

    await prisma.$executeRaw`
      INSERT INTO asistencia.novedad_diaria
        (employee_no, fecha, novedad, horas, novedades, minutos_brutos, minutos_netos, minutos_rrhh, updated_at)
      VALUES (
        ${employee_no}, ${fecha}::date, ${novedadLegacy}, ${sumHoras},
        ${novedadesJson}::jsonb, ${brutoInt}, ${netoInt}, ${rrhhInt}, now()
      )
      ON CONFLICT (employee_no, fecha)
      DO UPDATE SET
        novedad        = EXCLUDED.novedad,
        horas          = EXCLUDED.horas,
        novedades      = EXCLUDED.novedades,
        minutos_brutos = EXCLUDED.minutos_brutos,
        minutos_netos  = EXCLUDED.minutos_netos,
        minutos_rrhh   = EXCLUDED.minutos_rrhh,
        updated_at     = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[novedad PATCH]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
