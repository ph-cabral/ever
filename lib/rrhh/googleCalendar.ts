// Cliente mínimo de Google Calendar API (REST directo, sin el paquete
// googleapis — mismo criterio que lib/buscador/google.ts). Reusa la MISMA
// credencial OAuth2 (client_id/secret + refresh_token) que ya tiene
// autorizada n8n para Gmail/Drive (ver vicki_mail/app/gmail_client.py) —
// hace falta re-autorizar esa credencial agregando el scope de Calendar de
// abajo, si no las llamadas van a fallar con invalid_scope.
//
// Usado por /api/rrhh/asistencia/calendarios (listar) y
// /api/rrhh/asistencia/rango (crear evento de todo el día al registrar
// Vacaciones/etc. con rango de fechas) — 2026-08-01.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// Scope necesario en la credencial OAuth2 (Google Cloud Console > la misma
// app OAuth que usa n8n/vicki_mail). Sólo eventos (no ve/edita la lista de
// calendarios en sí más allá de listarla) — igual que gmail_client usa
// gmail.modify en vez de el scope completo de gmail.
const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

type CachedToken = { accessToken: string; expiresAt: number };
let cached: CachedToken | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} no está configurado — agregalo al .env del server (ver .env.example, sección Google Calendar).`,
    );
  }
  return v;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - 30_000 > now) return cached.accessToken;

  const client_id = requireEnv("GOOGLE_CLIENT_ID");
  const client_secret = requireEnv("GOOGLE_CLIENT_SECRET");
  const refresh_token = requireEnv("GOOGLE_REFRESH_TOKEN");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id,
      client_secret,
      refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `No se pudo renovar el token de Google (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cached.accessToken;
}

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const hint =
      res.status === 401 || res.status === 403 || detail.includes("invalid_scope")
        ? " — probablemente falta re-autorizar la credencial OAuth2 con el scope de Calendar."
        : "";
    throw new Error(`Google Calendar API ${res.status}: ${detail.slice(0, 300)}${hint}`);
  }
  return res.json() as Promise<T>;
}

export type CalendarioOption = {
  id: string;
  nombre: string;
  primary: boolean;
};

// Sólo calendarios donde tenemos permiso de escritura (writer/owner) — no
// tiene sentido ofrecer uno donde después el insert de evento va a fallar.
export async function listCalendars(): Promise<CalendarioOption[]> {
  const data = await callApi<{
    items: { id: string; summary: string; primary?: boolean; accessRole: string }[];
  }>("/users/me/calendarList?minAccessRole=writer");
  return (data.items ?? [])
    .map((c) => ({ id: c.id, nombre: c.summary, primary: !!c.primary }))
    .sort((a, b) => (a.primary === b.primary ? a.nombre.localeCompare(b.nombre) : a.primary ? -1 : 1));
}

const addDays = (fechaISO: string, dias: number): string => {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setDate(d.getDate() + dias);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export type CreatedEvent = { id: string; htmlLink: string | null };

// Evento de todo el día de `desde` a `hasta` (ambos inclusive). La API de
// Calendar espera `end.date` EXCLUSIVE, así que se manda hasta+1 día.
//
// `attendees` es opcional — invitados puntuales que se suman a este evento
// además de la gente que ya tiene agregada el calendario base elegido
// (2026-08-03). Se manda con `sendUpdates=all` para que
// Google les mande la invitación por mail (si no se manda ese query param,
// Google crea el evento pero no notifica a nadie).
export async function createAllDayEvent(opts: {
  calendarId: string;
  summary: string;
  description?: string;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  attendees?: string[];
}): Promise<CreatedEvent> {
  const { calendarId, summary, description, desde, hasta, attendees } = opts;
  const data = await callApi<{ id: string; htmlLink?: string }>(
    `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    {
      method: "POST",
      body: JSON.stringify({
        summary,
        description,
        start: { date: desde },
        end: { date: addDays(hasta, 1) },
        ...(attendees && attendees.length > 0
          ? { attendees: attendees.map((email) => ({ email })) }
          : {}),
      }),
    },
  );
  return { id: data.id, htmlLink: data.htmlLink ?? null };
}

export const CALENDAR_SCOPE_HINT = SCOPE;
