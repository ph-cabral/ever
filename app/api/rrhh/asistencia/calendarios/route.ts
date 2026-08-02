import { NextResponse } from "next/server";
import { listCalendars } from "@/lib/rrhh/googleCalendar";

export const dynamic = "force-dynamic";

// GET: calendarios de Google donde se puede crear el evento (accessRole >=
// writer) — para el selector del paso 2 del modal de rango. Ver
// lib/rrhh/googleCalendar.ts.
export async function GET() {
  try {
    const calendarios = await listCalendars();
    return NextResponse.json({ calendarios });
  } catch (e: any) {
    console.error("[calendarios GET]", e);
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 502 });
  }
}
