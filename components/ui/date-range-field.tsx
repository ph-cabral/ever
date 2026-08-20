"use client";

// Selector de rango de fechas: un solo trigger (botón, no editable a mano) +
// un solo calendario emergente. Click en el 1er día fija el inicio y NO
// cierra; click en un 2do día define el cierre del rango (ordena low/high
// solo, sin importar el orden de click) y ahí sí cierra. También cierra al
// clickear afuera o con Escape. Mientras se está eligiendo el 2do día, el
// hover pinta en vivo los días que va a abarcar el rango.
//
// Reemplaza los pares de <input type="date"> (Desde/Hasta) sueltos y el
// <DateField> (con tipeo manual) donde antes había 2 controles separados.

import * as React from "react";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------- utils fecha (ISO yyyy-mm-dd) ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");

const isoToDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
};

const dateToIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const isoToDisplay = (iso?: string | null): string => {
  const d = isoToDate(iso);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "";
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/* ---------------- utils "mes" (yyyy-mm), para MonthOrRangeField ---------------- */

const monthKeyOf = (iso: string) => iso.slice(0, 7); // "yyyy-mm-dd" → "yyyy-mm"

// Primer/último día ISO de un mes "yyyy-mm".
const monthBounds = (ym: string): [string, string] => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ["", ""];
  const y = +m[1];
  const mo = +m[2];
  return [dateToIso(new Date(y, mo - 1, 1)), dateToIso(new Date(y, mo, 0))];
};

// Últimos N meses "yyyy-mm" (más reciente primero, incluye el actual).
const lastMonths = (n: number): string[] => {
  const hoy = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return out;
};

const monthLabel = (ym: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return `${MONTHS[+m[2] - 1]} ${m[1]}`;
};

/**
 * Primer y último día ISO del último mes calendario completo (el anterior al
 * actual) — pensado como default inicial para MonthOrRangeField (a pedido de
 * Pablo, 2026-08-20: el filtro de Depósito arranca en "Mes" con el mes
 * pasado, no con "hoy").
 */
export function lastFullMonthRange(): [string, string] {
  const hoy = new Date();
  const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  return monthBounds(`${anterior.getFullYear()}-${pad(anterior.getMonth() + 1)}`);
}

/* ---------------- estilos por variante visual ---------------- */

type Variant = "dark" | "light";

const STYLES: Record<
  Variant,
  {
    trigger: string;
    triggerOpen: string;
    icon: string;
    popup: string;
    weekday: string;
    day: string;
    dayToday: string;
    dayInRange: string;
    dayEndpoint: string;
    dayDisabled: string;
    navBtn: string;
    monthLabel: string;
    /** Estilos del toggle "Mes"/"Rango" de MonthOrRangeField. */
    toggleBorder: string;
    toggleOn: string;
    toggleOff: string;
    /** Select nativo de mes de MonthOrRangeField. */
    select: string;
  }
> = {
  // Tema oscuro hex usado en deposito/*, compras/faltantes (bg #1f1f1f, acento amarillo).
  dark: {
    trigger:
      "flex items-center gap-2 h-8 px-2.5 rounded-lg border border-zinc-700 bg-[#1f1f1f] text-zinc-100 text-sm cursor-pointer select-none hover:border-zinc-500 transition-colors",
    triggerOpen: "border-yellow-400",
    icon: "text-zinc-500",
    popup: "rounded-lg border border-zinc-700 bg-[#1A1A1A] shadow-xl",
    weekday: "text-zinc-500",
    day: "text-zinc-200 hover:bg-zinc-700/60",
    dayToday: "border border-zinc-600",
    dayInRange: "bg-yellow-400/15 text-yellow-100",
    dayEndpoint: "bg-yellow-400 text-black hover:bg-yellow-400 font-medium",
    dayDisabled: "opacity-30 cursor-not-allowed hover:bg-transparent",
    navBtn: "text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-100",
    monthLabel: "text-zinc-200",
    toggleBorder: "border-zinc-700",
    toggleOn: "bg-yellow-400 text-black",
    toggleOff: "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50",
    select:
      "h-8 px-2.5 rounded-lg border border-zinc-700 bg-[#1f1f1f] text-zinc-100 text-sm cursor-pointer select-none outline-none focus:border-yellow-400 hover:border-zinc-500 transition-colors",
  },
  // Tema shadcn (tokens de tema) usado en rrhh/asistencia.
  light: {
    trigger:
      "flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground cursor-pointer select-none transition-colors dark:bg-input/30 hover:border-ring/60",
    triggerOpen: "border-ring ring-3 ring-ring/50",
    icon: "text-muted-foreground",
    popup: "rounded-lg border border-border bg-popover text-popover-foreground shadow-md",
    weekday: "text-muted-foreground",
    day: "text-foreground hover:bg-accent hover:text-accent-foreground",
    dayToday: "border border-border",
    dayInRange: "bg-accent text-accent-foreground",
    dayEndpoint: "bg-primary text-primary-foreground hover:bg-primary font-medium",
    dayDisabled: "opacity-30 cursor-not-allowed hover:bg-transparent",
    navBtn: "hover:bg-accent",
    monthLabel: "",
    toggleBorder: "border-input",
    toggleOn: "bg-primary text-primary-foreground",
    toggleOff: "text-muted-foreground hover:text-foreground hover:bg-accent",
    select:
      "h-8 px-2.5 rounded-lg border border-input bg-transparent text-sm text-foreground cursor-pointer select-none outline-none focus:border-ring dark:bg-input/30 hover:border-ring/60 transition-colors",
  },
};

export interface DateRangeFieldProps {
  /** Fecha desde, ISO yyyy-mm-dd. */
  desde: string;
  /** Fecha hasta, ISO yyyy-mm-dd. */
  hasta: string;
  /** Se llama una sola vez por selección, siempre con desde <= hasta. */
  onChange: (desde: string, hasta: string) => void;
  /** Día mínimo seleccionable (ISO), opcional. */
  min?: string;
  /** Día máximo seleccionable (ISO), opcional — ej. "hoy" para no elegir futuro. */
  max?: string;
  variant?: Variant;
  /** Lado por el que se alinea el desplegable respecto del trigger. */
  align?: "start" | "end";
  placeholder?: string;
  className?: string;
}

export function DateRangeField({
  desde,
  hasta,
  onChange,
  min,
  max,
  variant = "dark",
  align = "start",
  placeholder = "Elegir fechas",
  className,
}: DateRangeFieldProps) {
  const s = STYLES[variant];
  const [open, setOpen] = React.useState(false);
  // Día ya clickeado en esta sesión de selección; null = todavía no eligió el
  // 1er día (o ya cerró el rango y espera un click para arrancar de nuevo).
  const [pendingStart, setPendingStart] = React.useState<Date | null>(null);
  const [hoverDay, setHoverDay] = React.useState<Date | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const desdeDate = isoToDate(desde);
  const hastaDate = isoToDate(hasta);
  const minDate = isoToDate(min);
  const maxDate = isoToDate(max);

  const [cursor, setCursor] = React.useState<Date>(() => desdeDate ?? new Date());

  const openPicker = () => {
    setPendingStart(null);
    setHoverDay(null);
    setCursor(desdeDate ?? new Date());
    setOpen(true);
  };

  const closePicker = () => {
    setOpen(false);
    setPendingStart(null);
    setHoverDay(null);
  };

  // Cierra al clickear afuera del trigger/popover, o con Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closePicker();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePicker();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleDayClick = (d: Date) => {
    if (!pendingStart) {
      // 1er click: fija el inicio ya mismo (desde = hasta = ese día) y sigue abierto.
      setPendingStart(d);
      onChange(dateToIso(d), dateToIso(d));
    } else {
      // 2do click: cierra el rango (ordenado) y el desplegable.
      const lo = d < pendingStart ? d : pendingStart;
      const hi = d < pendingStart ? pendingStart : d;
      onChange(dateToIso(lo), dateToIso(hi));
      closePicker();
    }
  };

  // Límites a pintar: si hay una selección en curso, preview en vivo contra el
  // hover; si no, el rango ya confirmado (desde/hasta).
  let rangeLo: Date | null;
  let rangeHi: Date | null;
  if (pendingStart) {
    const other = hoverDay ?? pendingStart;
    if (other < pendingStart) {
      rangeLo = other;
      rangeHi = pendingStart;
    } else {
      rangeLo = pendingStart;
      rangeHi = other;
    }
  } else {
    rangeLo = desdeDate;
    rangeHi = hastaDate;
  }

  const label =
    desdeDate && hastaDate
      ? sameDay(desdeDate, hastaDate)
        ? isoToDisplay(desde)
        : `${isoToDisplay(desde)} – ${isoToDisplay(hasta)}`
      : placeholder;

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const isDisabled = (d: Date) => {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? closePicker() : openPicker())}
        className={cn(s.trigger, open && s.triggerOpen, className)}
      >
        <CalendarIcon className={cn("h-3.5 w-3.5 shrink-0", s.icon)} />
        <span className="whitespace-nowrap tabular-nums">{label}</span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute top-full mt-1.5 p-3 w-[260px] select-none z-50",
            align === "end" ? "right-0" : "left-0",
            s.popup,
          )}
          onMouseLeave={() => setHoverDay(null)}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className={cn("p-1 rounded", s.navBtn)}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className={cn("text-sm font-medium", s.monthLabel)}>
              {MONTHS[month]} {year}
            </div>
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className={cn("p-1 rounded", s.navBtn)}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className={cn("grid grid-cols-7 gap-0.5 text-center text-[11px] mb-1", s.weekday)}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const disabled = isDisabled(d);
              const isToday = sameDay(d, today);
              const isStart = !!rangeLo && sameDay(d, rangeLo);
              const isEnd = !!rangeHi && sameDay(d, rangeHi);
              const inRange = !!rangeLo && !!rangeHi && d >= rangeLo && d <= rangeHi;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  // Evita que el mousedown le saque foco al trigger antes del click.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => pendingStart && setHoverDay(d)}
                  onClick={() => handleDayClick(d)}
                  className={cn(
                    "h-7 w-7 mx-auto rounded text-xs transition-colors",
                    s.day,
                    isToday && !isStart && !isEnd && s.dayToday,
                    inRange && !disabled && s.dayInRange,
                    (isStart || isEnd) && !disabled && s.dayEndpoint,
                    disabled && s.dayDisabled,
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- MonthOrRangeField (Mes | Rango) ---------------- */

// Filtro combinado: toggle "Mes" (select simple de mes calendario, últimos N
// meses) / "Rango" (el DateRangeField de arriba, para desde-hasta libre). A
// pedido de Pablo, 2026-08-20, para el filtro de Depósito — arranca en "Mes";
// el default de desde/hasta (típicamente lastFullMonthRange()) lo pone el
// caller, no este componente.
export interface MonthOrRangeFieldProps {
  /** Fecha desde, ISO yyyy-mm-dd. */
  desde: string;
  /** Fecha hasta, ISO yyyy-mm-dd. */
  hasta: string;
  /** Se llama una sola vez por selección, siempre con desde <= hasta. */
  onChange: (desde: string, hasta: string) => void;
  /** Día mínimo seleccionable en modo "Rango" (ISO), opcional. */
  min?: string;
  /** Día máximo seleccionable en modo "Rango" (ISO), opcional. */
  max?: string;
  variant?: Variant;
  align?: "start" | "end";
  className?: string;
  /** Cuántos meses atrás ofrecer en el select de "Mes" (incluye el actual). Default 12. */
  monthsBack?: number;
}

export function MonthOrRangeField({
  desde,
  hasta,
  onChange,
  min,
  max,
  variant = "dark",
  align = "start",
  className,
  monthsBack = 12,
}: MonthOrRangeFieldProps) {
  const s = STYLES[variant];
  const [mode, setMode] = React.useState<"mes" | "rango">("mes");
  const meses = React.useMemo(() => lastMonths(monthsBack), [monthsBack]);
  const mesActual = desde ? monthKeyOf(desde) : "";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className={cn("flex rounded-lg overflow-hidden text-[11px] font-semibold shrink-0 border", s.toggleBorder)}>
        <button
          type="button"
          onClick={() => setMode("mes")}
          className={cn("px-2 py-1.5 transition-colors", mode === "mes" ? s.toggleOn : s.toggleOff)}
        >
          Mes
        </button>
        <button
          type="button"
          onClick={() => setMode("rango")}
          className={cn(
            "px-2 py-1.5 border-l transition-colors",
            s.toggleBorder,
            mode === "rango" ? s.toggleOn : s.toggleOff,
          )}
        >
          Rango
        </button>
      </div>

      {mode === "mes" ? (
        <select
          value={meses.includes(mesActual) ? mesActual : ""}
          onChange={(e) => {
            const ym = e.target.value;
            if (!ym) return;
            const [d, h] = monthBounds(ym);
            onChange(d, h);
          }}
          className={s.select}
        >
          {!meses.includes(mesActual) && <option value="">Elegir mes</option>}
          {meses.map((ym) => (
            <option key={ym} value={ym}>
              {monthLabel(ym)}
            </option>
          ))}
        </select>
      ) : (
        <DateRangeField
          desde={desde}
          hasta={hasta}
          onChange={onChange}
          min={min}
          max={max}
          variant={variant}
          align={align}
          placeholder="Elegir fechas"
        />
      )}
    </div>
  );
}
