"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---- estado global: solo un DateField abierto a la vez ---- */
let _active: string | null = null;
const _subs = new Set<() => void>();
const _setActive = (id: string | null) => {
  _active = id;
  _subs.forEach((l) => l());
};
const _subscribe = (l: () => void) => {
  _subs.add(l);
  return () => _subs.delete(l);
};
const useActiveField = () =>
  React.useSyncExternalStore(
    _subscribe,
    () => _active,
    () => _active,
  );

/* ---------------- utils fecha (ISO yyyy-mm-dd <-> dd/mm/yyyy) ---------------- */

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
  return d
    ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
    : "";
};

/** Acepta dd/mm/yyyy o ddmmyyyy. Devuelve ISO o null. */
const displayToIso = (s: string): string | null => {
  const digits = s.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const dd = +digits.slice(0, 2);
  const mm = +digits.slice(2, 4);
  const yyyy = +digits.slice(4, 8);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd)
    return null;
  return dateToIso(d);
};

/** Aplica máscara dd/mm/yyyy al ir tipeando. */
const maskInput = (raw: string): string => {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ---------------- Calendar grid ---------------- */

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

interface CalendarProps {
  selected: Date | null;
  min?: Date | null;
  max?: Date | null;
  onSelect: (d: Date) => void;
}

function Calendar({ selected, min, max, onSelect }: CalendarProps) {
  const [cursor, setCursor] = React.useState<Date>(
    () => selected ?? new Date(),
  );

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = startOfDay(new Date());
  const minD = min ? startOfDay(min) : null;
  const maxD = max ? startOfDay(max) : null;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const isDisabled = (d: Date) => {
    if (minD && d < minD) return true;
    if (maxD && d > maxD) return true;
    return false;
  };

  return (
    <div className="p-3 w-[260px] select-none">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="p-1 rounded hover:bg-accent"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-medium">
          {MONTHS[month]} {year}
        </div>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="p-1 rounded hover:bg-accent"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground mb-1">
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
          const isSelected = selected && sameDay(d, selected);
          const isToday = sameDay(d, today);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              // Evita que el mousedown saque el foco del input antes del select.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(d)}
              className={cn(
                "h-7 w-7 mx-auto rounded text-xs transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                disabled &&
                  "opacity-30 cursor-not-allowed hover:bg-transparent",
                isToday && !isSelected && "border border-border",
                isSelected &&
                  "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- DateField ---------------- */

export interface DateFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max"
> {
  value?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
}

export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  function DateField(
    {
      value = "",
      onChange,
      min,
      max,
      className,
      placeholder = "dd/mm/aaaa",
      disabled,
      ...rest
    },
    ref,
  ) {
    const id = React.useId();
    const active = useActiveField();
    const open = active === id;
    const setOpen = (v: boolean | ((p: boolean) => boolean)) => {
      const next = typeof v === "function" ? v(open) : v;
      _setActive(next ? id : null);
    };

    const [text, setText] = React.useState(() => isoToDisplay(value));

    const innerRef = React.useRef<HTMLInputElement>(null);
    const anchorRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    React.useEffect(() => {
      setText(isoToDisplay(value));
    }, [value]);

    const selectedDate = isoToDate(value);
    const minDate = isoToDate(min);
    const maxDate = isoToDate(max);

    const handleTextChange = (raw: string) => {
      const masked = maskInput(raw);
      setText(masked);
      const iso = displayToIso(masked);
      if (iso) onChange?.(iso);
      else if (masked === "") onChange?.("");
    };

    const handleBlur = () => {
      if (text && !displayToIso(text)) setText(isoToDisplay(value));
    };

    const handleSelect = (d: Date) => {
      onChange?.(dateToIso(d));
      setOpen(false);
    };

    return (
      // Sin Popover.Trigger: el toggle del trigger peleaba con onFocus al
      // saltar entre dos DateField. open lo maneja el estado global (un solo
      // field activo); el click dentro del propio field no cierra.
      <Popover.Root
        open={open}
        onOpenChange={(o, details) => {
          if (!o) {
            const t = (details as any)?.event?.target as Node | undefined;
            if (t && anchorRef.current?.contains(t)) return; // click en el input/ícono: no cerrar
            _setActive(null);
          } else {
            _setActive(id);
          }
        }}
      >
        <div
          ref={anchorRef}
          data-slot="date-field"
          className={cn(
            "group flex h-8 w-full min-w-0 items-center gap-1 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors md:text-sm",
            "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
            disabled &&
              "pointer-events-none cursor-not-allowed bg-input/50 opacity-50",
            "dark:bg-input/30",
            className,
          )}
        >
          <input
            ref={innerRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            onFocus={() => _setActive(id)}
            onChange={(e) => handleTextChange(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") {
                e.preventDefault();
                const iso = displayToIso(text);
                if (iso) {
                  onChange?.(iso);
                  setOpen(false);
                }
              }
            }}
            className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
            {...rest}
          />
          {/* Click en el ícono → enfocar input (abre por onFocus). */}
          <button
            type="button"
            aria-label="Abrir calendario"
            tabIndex={-1}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => innerRef.current?.focus()}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </div>

        <Popover.Portal>
          <Popover.Positioner anchor={anchorRef} sideOffset={6} align="start">
            <Popover.Popup
              initialFocus={false}
              className="z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-md outline-none"
            >
              <Calendar
                selected={selectedDate}
                min={minDate}
                max={maxDate}
                onSelect={handleSelect}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
