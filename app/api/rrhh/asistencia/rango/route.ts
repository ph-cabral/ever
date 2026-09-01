import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { createAllDayEvent } from "@/lib/rrhh/googleCalendar";

export const dynamic = "force-dynamic";

// POST: registrar un Estado/Novedad en un RANGO de fechas de una sola vez —
// (2026-08-01). Sólo se ofrece en el front para opciones con
// genera_calendario = true (ver /api/rrhh/asistencia/opciones); acá se
// revalida por las dudas.
//
// Efecto:
//  1) Crea el evento de todo el día en el Google Calendar elegido (si esto
//     falla, no se toca la base — mejor un error claro que dejar el estado
//     marcado sin que nadie se entere por Calendar). Si vienen `invitados`
//     (correos sueltos, 2026-08-03: "hay calendarios base
//     pero a veces se agregan participantes"), se suman como attendees del
//     evento además de la gente que ya tiene el calendario base.
//  2) Marca los días del rango:
//     - estado: usa el mecanismo de "arrastre" que ya tenía estado_diario
//       (ver resumen/route.ts) — sólo escribe UNA fila en `desde` con
//       dias = cantidad de días del rango, y limpia cualquier fila explícita
//       que hubiera quedado en el medio para que no tape la cuenta regresiva.
//     - novedad: no tiene arrastre, así que escribe una fila por día.
//  3) Loguea el evento creado en asistencia.calendar_evento.
type Body = {
  employee_no?: string;
  tipo?: "estado" | "novedad";
  nombre?: string;
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
  calendar_id?: string;
  horas?: number; // sólo tipo "novedad": horas por día del rango (no es un total)
  invitados?: string[]; // correos puntuales a sumar como attendees del evento
};

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DIAS = 366;

const diasEntre = (desde: string, hasta: string): number =>
  Math.round(
    (new Date(`${hasta}T00:00:00`).getTime() - new Date(`${desde}T00:00:00`).getTime()) /
      86_400_000,
  ) + 1;

const rangoFechas = (desde: string, hasta: string): string[] => {
  const out: string[] = [];
  const cur = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  while (cur <= fin) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { employee_no, tipo, nombre, desde, hasta, calendar_id } = body;

    // Invitados puntuales: se descarta cualquier valor que no tenga forma de
    // correo en vez de rechazar todo el registro — es un extra opcional, no
    // vale la pena bloquear el registro del estado/novedad por un typo ahí.
    const invitados = Array.from(
      new Set((body.invitados ?? []).map((e) => e.trim()).filter((e) => EMAIL_RE.test(e))),
    );

    if (!employee_no || !tipo || !nombre || !desde || !hasta || !calendar_id) {
      return NextResponse.json(
        {
          error:
            "employee_no, tipo, nombre, desde, hasta y calendar_id son obligatorios",
        },
        { status: 400 },
      );
    }
    if (tipo !== "estado" && tipo !== "novedad") {
      return NextResponse.json({ error: "tipo debe ser estado|novedad" }, { status: 400 });
    }
    // Novedad son horas puntuales dentro del día (a diferencia de estado, que
    // es el día entero) — hace falta cuántas horas por día del rango.
    const horasDia = tipo === "novedad" ? Math.trunc(Number(body.horas)) : 0;
    if (tipo === "novedad" && (!Number.isFinite(horasDia) || horasDia <= 0)) {
      return NextResponse.json(
        { error: "horas (por día) es obligatorio y mayor a 0 para novedad" },
        { status: 400 },
      );
    }
    if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta)) {
      return NextResponse.json(
        { error: "desde y hasta deben tener formato YYYY-MM-DD" },
        { status: 400 },
      );
    }
    if (hasta < desde) {
      return NextResponse.json({ error: "hasta debe ser >= desde" }, { status: 400 });
    }
    const dias = diasEntre(desde, hasta);
    if (dias > MAX_DIAS) {
      return NextResponse.json(
        { error: `El rango es demasiado largo (máx ${MAX_DIAS} días)` },
        { status: 400 },
      );
    }

    // Revalida que la opción exista y tenga habilitado el flujo de calendario
    // (el front sólo debería ofrecer esto para esas, pero por las dudas).
    const opcionRows = await prisma.$queryRaw<{ genera_calendario: boolean }[]>`
      SELECT genera_calendario FROM asistencia.opcion
      WHERE tipo = ${tipo} AND nombre = ${nombre} AND activo = true
    `;
    if (opcionRows.length === 0) {
      return NextResponse.json({ error: `Opción "${nombre}" no encontrada` }, { status: 404 });
    }
    if (!opcionRows[0].genera_calendario) {
      return NextResponse.json(
        { error: `"${nombre}" no tiene habilitado el registro en Calendar` },
        { status: 400 },
      );
    }

    // Match exacto: employee_no acá viene de un legajo ya elegido en la UI
    // (no es un ID crudo de reloj), así que no hace falta tolerar padding —
    // y no conviene: dos legajos que sólo difieren en ceros a la izquierda
    // (ej. "40" vs "00000040") son personas DISTINTAS (bug 2026-08-13).
    const empRows = await prisma.$queryRaw<{ employee_name: string | null }[]>`
      SELECT NULLIF(TRIM(l.nombre), '') AS employee_name
      FROM everwear.legajo l
      WHERE l."employeeNo" = ${employee_no}
      LIMIT 1
    `;
    const employeeName = empRows[0]?.employee_name ?? `#${employee_no}`;

    const session = await getSession().catch(() => null);
    const creadoPor = session?.nombre ?? null;

    const rangoTxt =
      desde === hasta ? desde : `${desde} al ${hasta} (${dias} día${dias === 1 ? "" : "s"})`;
    const descripcionPartes = [
      `${tipo === "estado" ? "Estado" : "Novedad"}: ${nombre}`,
      `Período: ${rangoTxt}`,
    ];
    if (tipo === "novedad") descripcionPartes.push(`Horas por día: ${horasDia}`);
    if (creadoPor) descripcionPartes.push(`Registrado por: ${creadoPor}`);
    if (invitados.length > 0) descripcionPartes.push(`Invitados: ${invitados.join(", ")}`);

    // 1) Google Calendar primero — si falla, no se toca la base.
    let evento;
    try {
      evento = await createAllDayEvent({
        calendarId: calendar_id,
        summary: `${nombre} · ${employeeName}`,
        description: descripcionPartes.join("\n"),
        desde,
        hasta,
        attendees: invitados,
      });
    } catch (e: any) {
      console.error("[rango] error creando evento en Calendar", e);
      return NextResponse.json(
        { error: `No se pudo crear el evento en Google Calendar: ${e?.message ?? e}` },
        { status: 502 },
      );
    }

    // 2) Marca los días en la base.
    if (tipo === "estado") {
      await prisma.$executeRaw`
        DELETE FROM asistencia.estado_diario
        WHERE employee_no = ${employee_no} AND fecha > ${desde}::date AND fecha <= ${hasta}::date
      `;
      await prisma.$executeRaw`
        INSERT INTO asistencia.estado_diario (employee_no, fecha, estado, dias, updated_at)
        VALUES (${employee_no}, ${desde}::date, ${nombre}, ${dias}, now())
        ON CONFLICT (employee_no, fecha)
        DO UPDATE SET estado = EXCLUDED.estado, dias = EXCLUDED.dias, updated_at = now()
      `;
    } else {
      const novedadesJson = JSON.stringify([{ novedad: nombre, horas: horasDia }]);
      for (const fecha of rangoFechas(desde, hasta)) {
        await prisma.$executeRaw`
          INSERT INTO asistencia.novedad_diaria
            (employee_no, fecha, novedad, horas, novedades, updated_at)
          VALUES (${employee_no}, ${fecha}::date, ${nombre}, ${horasDia}, ${novedadesJson}::jsonb, now())
          ON CONFLICT (employee_no, fecha)
          DO UPDATE SET
            novedad    = EXCLUDED.novedad,
            horas      = EXCLUDED.horas,
            novedades  = EXCLUDED.novedades,
            updated_at = now()
        `;
      }
    }

    // 3) Log.
    await prisma.$executeRaw`
      INSERT INTO asistencia.calendar_evento
        (employee_no, tipo, opcion, desde, hasta, calendar_id, event_id, event_link, created_by, invitados)
      VALUES (
        ${employee_no}, ${tipo}, ${nombre}, ${desde}::date, ${hasta}::date,
        ${calendar_id}, ${evento.id}, ${evento.htmlLink}, ${creadoPor},
        ${invitados.length > 0 ? invitados.join(", ") : null}
      )
    `;

    return NextResponse.json({ ok: true, event_id: evento.id, event_link: evento.htmlLink, dias });
  } catch (e: any) {
    console.error("[rango POST]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}
