// lib/rrhh/asistenciaIndicadores.ts
// Indicadores de Horas y Ausentismo calculados desde la API de fichadas
// (/api/rrhh/asistencia/resumen). Misma lógica de tope/estado que
// app/rrhh/asistencia/page.tsx, centralizada para reusar en las pestañas.

export type ResumenRow = {
  employee_no: string;
  employee_name: string | null;
  departamento: string | null;
  fecha: string; // YYYY-MM-DD
  check_in: string | null;
  check_out: string | null;
  minutos: number | null; // minutos fichados (check_out - check_in)
  eventos_dia: number | null;
  devices: string | null;
  estado: string | null; // guardado en estado_diario (editable)
  dias: number | null;
  novedad: string | null;
  horas: number | null; // horas de novedad descontadas
};

// Tope diario en minutos (jornada esperada): viernes 480, fin de semana 0, resto 540.
export const topeMin = (fecha: string): number => {
  const dow = new Date(`${fecha}T00:00:00`).getDay(); // 0 Dom .. 6 Sab
  if (dow === 5) return 480;
  if (dow === 0 || dow === 6) return 0;
  return 540;
};

// Estado auto cuando no hay uno guardado en BD.
export const calcEstado = (r: ResumenRow): "Normal" | "Ausente" | "Revisar" => {
  if (!r.check_in) return "Ausente";
  if (!r.check_out) return "Revisar";
  if ((r.minutos ?? 0) < 60) return "Revisar";
  return "Normal";
};

// Estado efectivo = el guardado, o el calculado por defecto.
export const effEstado = (r: ResumenRow): string => r.estado ?? calcEstado(r);

// Minutos netos ("En empresa") = fichados − horas de novedad.
export const netMin = (r: ResumenRow): number =>
  Math.max(0, (r.minutos ?? 0) - (r.horas ?? 0) * 60);

// Minutos RRHH = netos con tope diario aplicado.
export const rrhhMin = (r: ResumenRow): number => Math.min(netMin(r), topeMin(r.fecha));

// Estados que NO cuentan como ausencia (ajustá esta lista si querés incluir
// "Ausente" como injustificada en el % de ausentismo).
export const ESTADOS_NO_AUSENCIA = ["Normal", "Ausente", "Revisar"];

export type ParArea = { name: string; value: number };

export type Indicadores = {
  totalHoras: number; // Total de horas mensual EW (RRHH, con tope)
  horasExtras: number; // netas por encima del tope
  horasInactivas: number; // tope perdido en días Ausente / Revisar
  ratioExtras: number; // % = extras / total
  ratioInactivas: number; // % = inactivas / total
  ratioAusencia: number; // % de ausencia por jornada hábil
  jornadasEsperadas: number; // jornadas hábiles (tope > 0)
  diasAusencia: number; // días-empleado con ausencia (justificada)
  personasAusentes: number;
  extrasPorArea: ParArea[]; // horas extra por sector
  ausenciaPorMotivo: ParArea[]; // días por estado (excluye Normal/Ausente/Revisar)
  ausenciaPorArea: ParArea[]; // días de ausencia por sector
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const dep = (r: ResumenRow) => (r.departamento ?? "").trim() || "Sin área";

export function computeIndicadores(rows: ResumenRow[]): Indicadores {
  let totalMin = 0;
  let extrasMin = 0;
  let inactMin = 0;
  let jornadas = 0;
  let diasAus = 0;

  const extrasArea = new Map<string, number>(); // minutos
  const motivo = new Map<string, number>(); // días
  const ausArea = new Map<string, number>(); // días
  const personas = new Set<string>();

  for (const r of rows) {
    const tope = topeMin(r.fecha);
    const net = netMin(r);
    const rrhh = Math.min(net, tope);
    const est = effEstado(r);

    totalMin += rrhh;
    if (tope > 0) jornadas++;

    // Horas extra: trabajado por encima del tope diario.
    const ex = Math.max(0, net - tope);
    if (ex > 0) extrasArea.set(dep(r), (extrasArea.get(dep(r)) ?? 0) + ex);
    extrasMin += ex;

    // Horas inactivas: tope perdido en días Ausente / Revisar.
    if (est === "Ausente" || est === "Revisar") {
      inactMin += Math.max(0, tope - rrhh);
    }

    // Ausentismo (por estado, excluye Normal/Ausente/Revisar) en jornada hábil.
    if (tope > 0 && !ESTADOS_NO_AUSENCIA.includes(est)) {
      diasAus++;
      personas.add(r.employee_no);
      motivo.set(est, (motivo.get(est) ?? 0) + 1);
      ausArea.set(dep(r), (ausArea.get(dep(r)) ?? 0) + 1);
    }
  }

  const totalHoras = totalMin / 60;
  const horasExtras = extrasMin / 60;
  const horasInactivas = inactMin / 60;

  const toHours = (m: Map<string, number>): ParArea[] =>
    [...m.entries()]
      .map(([name, v]) => ({ name, value: round1(v / 60) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  const toCount = (m: Map<string, number>): ParArea[] =>
    [...m.entries()]
      .map(([name, v]) => ({ name, value: v }))
      .sort((a, b) => b.value - a.value);

  return {
    totalHoras: round1(totalHoras),
    horasExtras: round1(horasExtras),
    horasInactivas: round1(horasInactivas),
    ratioExtras: totalHoras > 0 ? round1((horasExtras / totalHoras) * 100) : 0,
    ratioInactivas: totalHoras > 0 ? round1((horasInactivas / totalHoras) * 100) : 0,
    ratioAusencia: jornadas > 0 ? round1((diasAus / jornadas) * 100) : 0,
    jornadasEsperadas: jornadas,
    diasAusencia: diasAus,
    personasAusentes: personas.size,
    extrasPorArea: toHours(extrasArea),
    ausenciaPorMotivo: toCount(motivo),
    ausenciaPorArea: toCount(ausArea),
  };
}

// ── Fetch + rango de mes ──────────────────────────────────────────────────────

export async function fetchResumen(desde: string, hasta: string): Promise<ResumenRow[]> {
  const qs = new URLSearchParams({ desde, hasta });
  const r = await fetch(`/api/rrhh/asistencia/resumen?${qs}`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e?.error ?? "Error al cargar fichadas");
  }
  return r.json();
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const currentYm = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Convierte "YYYY-MM" en rango desde/hasta (hasta acotado al día de hoy).
export function mesRange(ym: string): { desde: string; hasta: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const desde = `${ym}-01`;
  let hasta = `${ym}-${String(last).padStart(2, "0")}`;
  const hoy = ymd(new Date());
  if (hasta > hoy && desde <= hoy) hasta = hoy;
  return { desde, hasta };
}
