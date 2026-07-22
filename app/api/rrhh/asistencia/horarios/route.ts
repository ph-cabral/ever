import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type HorarioTipo = {
  id: number;
  nombre: string;
  tope_lun: number;
  tope_mar: number;
  tope_mie: number;
  tope_jue: number;
  tope_vie: number;
  tope_sab: number;
  tope_dom: number;
};

export type HorarioAsignacion = {
  departamento: string;
  horario_tipo_id: number;
};

type Body = {
  kind?: "tipo" | "asignacion";
  // kind === "tipo"
  id?: number | null;
  nombre?: string;
  tope_lun?: number;
  tope_mar?: number;
  tope_mie?: number;
  tope_jue?: number;
  tope_vie?: number;
  tope_sab?: number;
  tope_dom?: number;
  // kind === "asignacion"
  departamento?: string;
  horario_tipo_id?: number | null; // null/0 => borra la asignación (vuelve al default)
};

const toInt = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

// GET: lista de tipos de horario + asignaciones por área. Un área sin
// asignación explícita usa el tipo "Estándar (Lun-Vie)" como fallback
// (resuelto del lado del cliente, ver buildTopeResolver en asistenciaIndicadores.ts).
export async function GET() {
  try {
    const tipos = await prisma.$queryRawUnsafe<HorarioTipo[]>(
      `SELECT id, nombre, tope_lun, tope_mar, tope_mie, tope_jue, tope_vie, tope_sab, tope_dom
       FROM asistencia.horario_tipo
       ORDER BY id`,
    );
    const asignaciones = await prisma.$queryRawUnsafe<HorarioAsignacion[]>(
      `SELECT departamento, horario_tipo_id
       FROM asistencia.horario_area
       ORDER BY departamento`,
    );
    return NextResponse.json({ tipos, asignaciones });
  } catch (e: any) {
    console.error("[horarios GET]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body: Body = await req.json();

    if (body.kind === "tipo") {
      const nombre = (body.nombre ?? "").trim();
      if (!nombre) {
        return NextResponse.json(
          { error: "nombre es obligatorio" },
          { status: 400 },
        );
      }
      const vals = {
        lun: toInt(body.tope_lun, 540),
        mar: toInt(body.tope_mar, 540),
        mie: toInt(body.tope_mie, 540),
        jue: toInt(body.tope_jue, 540),
        vie: toInt(body.tope_vie, 480),
        sab: toInt(body.tope_sab, 0),
        dom: toInt(body.tope_dom, 0),
      };

      if (body.id) {
        await prisma.$executeRaw`
          UPDATE asistencia.horario_tipo
          SET nombre = ${nombre}, tope_lun = ${vals.lun}, tope_mar = ${vals.mar},
              tope_mie = ${vals.mie}, tope_jue = ${vals.jue}, tope_vie = ${vals.vie},
              tope_sab = ${vals.sab}, tope_dom = ${vals.dom}, updated_at = now()
          WHERE id = ${body.id}
        `;
      } else {
        await prisma.$executeRaw`
          INSERT INTO asistencia.horario_tipo
            (nombre, tope_lun, tope_mar, tope_mie, tope_jue, tope_vie, tope_sab, tope_dom, updated_at)
          VALUES (${nombre}, ${vals.lun}, ${vals.mar}, ${vals.mie}, ${vals.jue}, ${vals.vie}, ${vals.sab}, ${vals.dom}, now())
          ON CONFLICT (nombre) DO UPDATE SET
            tope_lun = EXCLUDED.tope_lun, tope_mar = EXCLUDED.tope_mar,
            tope_mie = EXCLUDED.tope_mie, tope_jue = EXCLUDED.tope_jue,
            tope_vie = EXCLUDED.tope_vie, tope_sab = EXCLUDED.tope_sab,
            tope_dom = EXCLUDED.tope_dom, updated_at = now()
        `;
      }
      return NextResponse.json({ ok: true });
    }

    if (body.kind === "asignacion") {
      const departamento = (body.departamento ?? "").trim();
      if (!departamento) {
        return NextResponse.json(
          { error: "departamento es obligatorio" },
          { status: 400 },
        );
      }
      if (!body.horario_tipo_id) {
        // Sin tipo => borra la asignación, el área vuelve al fallback "Estándar".
        await prisma.$executeRaw`
          DELETE FROM asistencia.horario_area WHERE departamento = ${departamento}
        `;
        return NextResponse.json({ ok: true, deleted: true });
      }
      await prisma.$executeRaw`
        INSERT INTO asistencia.horario_area (departamento, horario_tipo_id, updated_at)
        VALUES (${departamento}, ${body.horario_tipo_id}, now())
        ON CONFLICT (departamento) DO UPDATE SET
          horario_tipo_id = EXCLUDED.horario_tipo_id, updated_at = now()
      `;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "kind (tipo|asignacion) es obligatorio" },
      { status: 400 },
    );
  } catch (e: any) {
    console.error("[horarios PATCH]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
