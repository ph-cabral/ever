"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  memo,
  useDeferredValue,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  fetchHorarios,
  buildTopeResolver,
  type HorarioTipo,
  type HorarioAsignacion,
} from "@/lib/rrhh/asistenciaIndicadores";

type Row = {
  employee_no: string;
  employee_name: string | null;
  departamento: string | null;
  sector: string | null;
  fecha: string;
  check_in: string | null;
  check_out: string | null;
  minutos: number | null;
  eventos_dia: number | null;
  devices: string | null;
  ajustado?: boolean;
  estado: string | null;
  dias: number | null;
  novedad: string | null;
  horas: number | null;
};

type Edit = {
  estado?: string;
  dias?: string;
  novedad?: string;
  horas?: string;
  novedades?: { novedad: string; horas: number }[];
};

const ESTADOS = [
  "Art",
  "Acompañamiento familiar",
  "Capacitación",
  "Dia Expo",
  "Enfermedad",
  "Fallecimientos",
  "Gira comercial",
  "Nac. de hijo",
  "Suspención",
  "Vacaciones",
  "Ausente",
  "Normal",
  "Revisar",
];

const NOVEDADES = [
  "Tram. Ban.",
  "Tram. Per.",
  "Tram. Jud.",
  "Est. Med.",
  "Prob. Mov.",
];

const todayLocal = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fmtTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const fmtHHMM = (min: number | null) => {
  if (min == null) return "—";
  const h = Math.floor(min / 60),
    m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// HH:MM en hora local del navegador, para precargar el input type="time".
const toHHMM = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Estado calculado por defecto (uno de: Normal | Ausente | Revisar)
const calcEstado = (r: Row): "Normal" | "Ausente" | "Revisar" => {
  if (!r.check_in) return "Ausente";
  if (!r.check_out) return "Revisar";
  if ((r.minutos ?? 0) < 60) return "Revisar";
  return "Normal";
};

const AREA_TONES = [
  "bg-sky-100 text-sky-800 border-sky-200",
  "bg-emerald-100 text-emerald-800 border-emerald-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-violet-100 text-violet-800 border-violet-200",
  "bg-rose-100 text-rose-800 border-rose-200",
  "bg-cyan-100 text-cyan-800 border-cyan-200",
  "bg-orange-100 text-orange-800 border-orange-200",
  "bg-lime-100 text-lime-800 border-lime-200",
];

const estadoTone = (s: string) => {
  if (s === "Normal")
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "Ausente") return "bg-zinc-100 text-zinc-700 border-zinc-200";
  if (s === "Revisar") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-sky-100 text-sky-800 border-sky-200"; // justificaciones
};

// Picker genérico: botón que despliega opciones; al elegir, foco al input num.
// El guardado se dispara en onBlur / Enter del input numérico (onCommit).
function Picker({
  value,
  options,
  toneClass,
  numValue,
  numLabel,
  placeholder,
  onPick,
  onNum,
  onCommit,
}: {
  value?: string;
  options: string[];
  toneClass?: string;
  numValue?: string;
  numLabel: string;
  placeholder: string;
  onPick: (v: string) => void;
  onNum: (v: string) => void;
  onCommit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  }>({ top: 0, left: 0, width: 192 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLInputElement>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const margin = 8;
    const panelH = panelRef.current?.offsetHeight ?? options.length * 32 + 8;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const flipUp = spaceBelow < panelH && r.top - margin > spaceBelow;
    setCoords({
      ...(flipUp
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
      left: r.left,
      width: Math.max(r.width, 176),
    });
  };

  const toggle = () => {
    if (!open) place();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        btnRef.current &&
        !btnRef.current.contains(t) &&
        panelRef.current &&
        !panelRef.current.contains(t)
      )
        setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={toggle}
          className={cn(
            "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap hover:opacity-90",
            value
              ? toneClass
              : "bg-muted text-muted-foreground border-transparent",
          )}
        >
          {value ?? placeholder}
        </button>
        {open &&
          createPortal(
            <div
              ref={panelRef}
              style={{
                position: "fixed",
                top: coords.top,
                bottom: coords.bottom,
                left: coords.left,
                width: coords.width,
              }}
              className="z-[100] rounded-md border bg-popover p-1 shadow-md"
            >
              {options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onPick(opt);
                    setOpen(false);
                    setTimeout(() => numRef.current?.focus(), 0);
                  }}
                  className={cn(
                    "block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent",
                    value === opt && "bg-accent",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>
      <Input
        ref={numRef}
        type="number"
        min={0}
        inputMode="numeric"
        value={numValue ?? ""}
        onChange={(e) => onNum(e.target.value)}
        onBlur={() => onCommit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur(); // dispara onBlur -> onCommit
          }
        }}
        placeholder={numLabel}
        title={numLabel}
        className="h-8 w-16"
      />
    </div>
  );
}

type Evento = {
  device: string;
  employee_no: string;
  employee_name: string | null;
  event_time: string;
  tipo: string | null;
  major: number | null;
  minor: number | null;
};

// Celda con botón que abre modal con todos los fichajes del día.
function FichajesCell({
  employee_no,
  fecha,
  count,
}: {
  employee_no: string;
  fecha: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eventos, setEventos] = useState<Evento[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        desde: fecha,
        hasta: fecha,
        employee_no,
      });
      const r = await fetch(`/api/rrhh/asistencia/eventos?${qs}`);
      setEventos(r.ok ? await r.json() : []);
    } finally {
      setLoading(false);
    }
  }, [employee_no, fecha]);

  const openModal = () => {
    setOpen(true);
    load();
  };

  return (
    <>
      <button
        type="button"
        disabled={count === 0}
        onClick={openModal}
        className={cn(
          "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium",
          count > 0
            ? "bg-sky-100 text-sky-800 border-sky-200 hover:opacity-90"
            : "bg-muted text-muted-foreground border-transparent cursor-default",
        )}
      >
        {count} {count === 1 ? "fichaje" : "fichajes"}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="max-h-[80vh] w-full max-w-md overflow-auto rounded-lg border bg-popover p-4 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">Fichajes · {fecha}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Cargando…
                </p>
              ) : eventos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin fichajes
                </p>
              ) : (
                <ul className="divide-y">
                  {eventos.map((ev, i) => (
                    <li
                      key={`${ev.event_time}-${i}`}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="font-mono">
                        {fmtTime(ev.event_time)}
                      </span>
                      <span className="text-muted-foreground">{ev.device}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// Editor manual de Ingreso/Egreso — para el caso de un fichaje incompleto
// (entró y no marcó salida, o hay una sola marca a la tarde y falta la de
// la mañana). Sólo aparece cuando falta alguno de los dos lados; permite
// cargar ambos porque la única marca que sí existe puede estar mal
// clasificada (ver sql/asistencia_ajuste_manual.sql).
function HorarioEditor({
  employee_no,
  fecha,
  checkIn,
  checkOut,
  onSaved,
}: {
  employee_no: string;
  fecha: string;
  checkIn: string | null;
  checkOut: string | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [ci, setCi] = useState(checkIn ? toHHMM(checkIn) : "");
  const [co, setCo] = useState(checkOut ? toHHMM(checkOut) : "");
  const [saving, setSaving] = useState(false);

  const openModal = () => {
    setCi(checkIn ? toHHMM(checkIn) : "");
    setCo(checkOut ? toHHMM(checkOut) : "");
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/rrhh/asistencia/ajuste", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_no,
          fecha,
          check_in: ci ? `${fecha}T${ci}:00-03:00` : null,
          check_out: co ? `${fecha}T${co}:00-03:00` : null,
        }),
      });
      setOpen(false);
      onSaved();
    } catch (err) {
      console.error("[ajuste horario]", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Asignar horario manualmente"
        className="ml-1 inline-flex text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-xs rounded-lg border bg-popover p-4 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-sm font-medium">
                Editar horario · {fecha}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Ingreso
                  </label>
                  <Input
                    type="time"
                    value={ci}
                    onChange={(e) => setCi(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Egreso
                  </label>
                  <Input
                    type="time"
                    value={co}
                    onChange={(e) => setCo(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-md border bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// Fila memoizada: editar/tipear una fila no re-renderiza el resto de la tabla.
const AsistenciaRow = memo(function AsistenciaRow({
  row,
  edit,
  desde,
  hasta,
  resolveTope,
  onPatch,
  onCommit,
  onHorarioSaved,
  isAdmin,
}: {
  row: Row;
  edit: Edit | undefined;
  desde: string;
  hasta: string;
  resolveTope: (r: Row) => number;
  onPatch: (k: string, p: Edit) => void;
  onCommit: (k: string, kind: "estado" | "novedad", bruto?: number) => void;
  onHorarioSaved: () => void;
  isAdmin: boolean;
}) {
  const k = `${row.employee_no}|${row.fecha}`;
  const e = edit ?? {};
  const est = e.estado ?? calcEstado(row);
  const horasNov = parseInt(e.horas || "0", 10) || 0;
  const netMin = Math.max(0, (row.minutos ?? 0) - horasNov * 60);
  const tope = resolveTope(row);
  const rrhhMin = Math.min(netMin, tope);
  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/rrhh/asistencia/${row.employee_no}?desde=${desde}&hasta=${hasta}`}
          className="text-primary hover:underline"
        >
          {row.employee_name ?? `#${row.employee_no}`}
        </Link>
      </TableCell>
      <TableCell>{row.fecha}</TableCell>
      <TableCell>{row.devices ?? "—"}</TableCell>
      <TableCell>
        <div className="flex items-center">
          <span className={row.ajustado ? "italic text-amber-700" : undefined}>
            {fmtTime(row.check_in)}
          </span>
          {isAdmin && (!row.check_in || !row.check_out) && (
            <HorarioEditor
              employee_no={row.employee_no}
              fecha={row.fecha}
              checkIn={row.check_in}
              checkOut={row.check_out}
              onSaved={onHorarioSaved}
            />
          )}
        </div>
      </TableCell>
      <TableCell>
        <span className={row.ajustado ? "italic text-amber-700" : undefined}>
          {fmtTime(row.check_out)}
        </span>
      </TableCell>
      <TableCell
        title={
          horasNov
            ? `Bruto ${fmtHHMM(row.minutos)} − ${horasNov} hs`
            : undefined
        }
      >
        {fmtHHMM(netMin)}
      </TableCell>
      <TableCell title={`Neto ${fmtHHMM(netMin)} · tope ${fmtHHMM(tope)}`}>
        {fmtHHMM(rrhhMin)}
      </TableCell>
      <TableCell>
        <FichajesCell
          employee_no={row.employee_no}
          fecha={row.fecha}
          count={row.eventos_dia ?? 0}
        />
      </TableCell>
      <TableCell>
        <Picker
          value={est}
          options={ESTADOS}
          toneClass={estadoTone(est)}
          numValue={e.dias}
          numLabel="días"
          placeholder="Estado"
          onPick={(v) => onPatch(k, { estado: v })}
          onNum={(v) => onPatch(k, { dias: v })}
          onCommit={() => onCommit(k, "estado")}
        />
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <Picker
            value={e.novedad}
            options={NOVEDADES}
            toneClass="bg-violet-100 text-violet-800 border-violet-200"
            numValue={e.horas}
            numLabel="hs"
            placeholder="Novedad"
            onPick={(v) => onPatch(k, { novedad: v })}
            onNum={(v) => onPatch(k, { horas: v })}
            onCommit={() => onCommit(k, "novedad", row.minutos ?? 0)}
          />
        </div>
      </TableCell>
    </TableRow>
  );
});

export default function AsistenciaPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [empleado, setEmpleado] = useState("");
  const [estado, setEstado] = useState<string>("all");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [area, setArea] = useState<string>("all");
  const [sector, setSector] = useState<string>("all");

  // El ajuste manual de Ingreso/Egreso sólo lo puede cargar un ADMIN (el
  // endpoint también lo exige — esto es sólo para no mostrar el lápiz a
  // quien de todas formas no puede guardarlo).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsAdmin(d?.usuario?.rol === "ADMIN"))
      .catch(() => setIsAdmin(false));
  }, []);

  // Horarios por área (tope diario) — ver /api/rrhh/asistencia/horarios.
  const [tipos, setTipos] = useState<HorarioTipo[]>([]);
  const [asignaciones, setAsignaciones] = useState<HorarioAsignacion[]>([]);
  const [horariosOpen, setHorariosOpen] = useState(false);

  const loadHorarios = useCallback(async () => {
    const h = await fetchHorarios();
    setTipos(h.tipos);
    setAsignaciones(h.asignaciones);
  }, []);

  useEffect(() => {
    loadHorarios();
  }, [loadHorarios]);

  const resolveTope = useMemo(
    () => buildTopeResolver(tipos, asignaciones),
    [tipos, asignaciones],
  );

  // Ref para leer ediciones actuales dentro de onBlur sin closures stale.
  const editsRef = useRef(edits);
  useEffect(() => {
    editsRef.current = edits;
  }, [edits]);

  const [desde, setDesde] = useState(todayLocal());
  const [hasta, setHasta] = useState(todayLocal());
  const hastaTouched = useRef(false);

  const onDesdeChange = (v: string) => {
    setDesde(v);
    if (!hastaTouched.current) setHasta(v);
    else if (v > hasta) setHasta(v);
  };
  const onHastaChange = (v: string) => {
    hastaTouched.current = true;
    setHasta(v);
  };

  const keyOf = (r: Row) => `${r.employee_no}|${r.fecha}`;
  const patch = useCallback(
    (k: string, p: Edit) =>
      setEdits((prev) => ({ ...prev, [k]: { ...prev[k], ...p } })),
    [],
  );

  // Guardado en DB (blur/Enter). kind = qué picker disparó.
  const commit = useCallback(
    async (k: string, kind: "estado" | "novedad", bruto?: number) => {
      const sep = k.lastIndexOf("|");
      const employee_no = k.slice(0, sep);
      const fecha = k.slice(sep + 1);
      const e = editsRef.current[k] ?? {};

      let body: any;
      if (kind === "estado") {
        body = {
          employee_no,
          fecha,
          kind,
          value: e.estado ?? null,
          num: e.dias ?? null,
        };
      } else {
        const horas = parseInt(e.horas || "0", 10) || 0;
        const brutoMin = bruto ?? 0;
        const netoMin = Math.max(0, brutoMin - horas * 60);
        body = {
          employee_no,
          fecha,
          kind,
          value: e.novedad ?? null,
          num: e.horas ?? null,
          bruto: brutoMin,
          neto: netoMin,
        };
      }

      if (
        (body.value == null || body.value === "") &&
        (body.num == null || body.num === "")
      )
        return;

      try {
        await fetch("/api/rrhh/asistencia/novedad", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error("[novedad commit]", err);
      }
    },
    [],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ desde, hasta });
      const r = await fetch(`/api/rrhh/asistencia/resumen?${qs}`);
      if (!r.ok) {
        console.error(await r.json().catch(() => ({ error: r.statusText })));
        setRows([]);
        setEdits({});
        return;
      }
      const data: Row[] = await r.json();
      setRows(data);

      // Precargar ediciones guardadas (reemplaza al cambiar de rango).
      const initial: Record<string, Edit> = {};
      for (const row of data) {
        if (
          row.estado != null ||
          row.dias != null ||
          row.novedad != null ||
          row.horas != null
        ) {
          initial[`${row.employee_no}|${row.fecha}`] = {
            estado: row.estado ?? undefined,
            dias: row.dias != null ? String(row.dias) : undefined,
            novedad: row.novedad ?? undefined,
            horas: row.horas != null ? String(row.horas) : undefined,
          };
        }
      }
      setEdits(initial);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const effEstado = (r: Row) => edits[keyOf(r)]?.estado ?? calcEstado(r);

  const empleadoDef = useDeferredValue(empleado);

  const areas = useMemo(
    () =>
      [
        ...new Set(rows.map((r) => r.departamento).filter(Boolean) as string[]),
      ].sort(),
    [rows],
  );

  const sectores = useMemo(
    () =>
      [...new Set(rows.map((r) => r.sector).filter(Boolean) as string[])].sort(),
    [rows],
  );

  const empleadosPorArea = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (!r.check_in || r.check_out) continue; // presentes = marcados sin egreso
      const a = (r.departamento ?? "").trim() || "Sin área";
      if (a.toLowerCase() === "locales") continue; // no cuenta en este widget
      m.set(a, (m.get(a) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const marcados = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.check_in &&
          !r.check_out &&
          (r.departamento ?? "").trim().toLowerCase() !== "locales",
      ).length,
    [rows],
  );

  const filtered = useMemo(() => {
    const q = empleadoDef.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(r.employee_name ?? "").toLowerCase().includes(q)) return false;
      if (estado !== "all" && effEstado(r) !== estado) return false;
      if (area !== "all" && (r.departamento ?? "") !== area) return false;
      if (sector !== "all" && (r.sector ?? "") !== sector) return false;
      return true;
    });
  }, [rows, empleadoDef, estado, area, sector, edits]);

  return (
    <div className="container mx-auto px-6 py-8">
      <InicioButton label="Inicio" iconSize={16} className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4" />
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Asistencia</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Empleados activos · estado calculado y editable · novedades por día.
          </p>
          <button
            type="button"
            onClick={() => setHorariosOpen((o) => !o)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            {horariosOpen ? "Ocultar horarios" : "Configurar horarios por área"}
          </button>
        </div>
        {empleadosPorArea.length > 0 && (
          <div className="flex flex-col items-center gap-2 rounded-[2rem] border px-6 py-3">
            <span className="text-sm font-medium">
              Total <span className="font-semibold">{marcados}</span>
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              {empleadosPorArea.map(([a, n], i) => (
                <div
                  key={a}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
                    AREA_TONES[i % AREA_TONES.length],
                  )}
                >
                  <span className="text-sm font-semibold">{n}</span>
                  <span>{a}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      {horariosOpen && (
        <HorariosPanel
          tipos={tipos}
          asignaciones={asignaciones}
          areas={areas}
          onReload={loadHorarios}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <Input
          placeholder="Empleado…"
          value={empleado}
          onChange={(e) => setEmpleado(e.target.value)}
        />
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {ESTADOS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sector} onValueChange={setSector}>
          <SelectTrigger>
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los sectores</SelectItem>
            {sectores.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={area} onValueChange={setArea}>
          <SelectTrigger>
            <SelectValue placeholder="Área" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las áreas</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateField value={desde} onChange={onDesdeChange} />
        <DateField value={hasta} min={desde} onChange={onHastaChange} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Reloj</TableHead>
              <TableHead>Ingreso</TableHead>
              <TableHead>Egreso</TableHead>
              <TableHead>En empresa</TableHead>
              <TableHead>RRHH</TableHead>
              <TableHead>Fichajes</TableHead>
              <TableHead>Estado / Días</TableHead>
              <TableHead className="text-right">Novedad / Horas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center py-8 text-muted-foreground"
                >
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center py-8 text-muted-foreground"
                >
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <AsistenciaRow
                key={`${r.employee_no}|${r.fecha}-${r.devices}`}
                row={r}
                edit={edits[`${r.employee_no}|${r.fecha}`]}
                desde={desde}
                hasta={hasta}
                resolveTope={resolveTope}
                onPatch={patch}
                onCommit={commit}
                onHorarioSaved={fetchData}
                isAdmin={isAdmin}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Panel de administración: editar los topes (minutos esperados por día de
// semana) de cada horario_tipo, y asignar cada área a un tipo. Un área sin
// asignación usa "Estándar (Lun-Vie)" por defecto (ver buildTopeResolver).
function HorariosPanel({
  tipos,
  asignaciones,
  areas,
  onReload,
}: {
  tipos: HorarioTipo[];
  asignaciones: HorarioAsignacion[];
  areas: string[];
  onReload: () => Promise<void>;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<number, HorarioTipo>>({});
  const [nuevo, setNuevo] = useState({
    nombre: "",
    tope_lun: "540",
    tope_mar: "540",
    tope_mie: "540",
    tope_jue: "540",
    tope_vie: "480",
    tope_sab: "0",
    tope_dom: "0",
  });

  const DIAS: { key: keyof HorarioTipo; label: string }[] = [
    { key: "tope_lun", label: "Lun" },
    { key: "tope_mar", label: "Mar" },
    { key: "tope_mie", label: "Mié" },
    { key: "tope_jue", label: "Jue" },
    { key: "tope_vie", label: "Vie" },
    { key: "tope_sab", label: "Sáb" },
    { key: "tope_dom", label: "Dom" },
  ];

  const valOf = (t: HorarioTipo, key: keyof HorarioTipo) =>
    draft[t.id]?.[key] ?? t[key];

  const setVal = (t: HorarioTipo, key: keyof HorarioTipo, v: string) => {
    const n = parseInt(v, 10) || 0;
    setDraft((prev) => ({
      ...prev,
      [t.id]: { ...(prev[t.id] ?? t), [key]: n },
    }));
  };

  const guardarTipo = async (t: HorarioTipo) => {
    setSaving(`tipo-${t.id}`);
    try {
      const d = draft[t.id] ?? t;
      await fetch("/api/rrhh/asistencia/horarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "tipo", id: t.id, ...d }),
      });
      await onReload();
    } finally {
      setSaving(null);
    }
  };

  const crearTipo = async () => {
    if (!nuevo.nombre.trim()) return;
    setSaving("nuevo");
    try {
      await fetch("/api/rrhh/asistencia/horarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "tipo",
          nombre: nuevo.nombre,
          tope_lun: parseInt(nuevo.tope_lun, 10) || 0,
          tope_mar: parseInt(nuevo.tope_mar, 10) || 0,
          tope_mie: parseInt(nuevo.tope_mie, 10) || 0,
          tope_jue: parseInt(nuevo.tope_jue, 10) || 0,
          tope_vie: parseInt(nuevo.tope_vie, 10) || 0,
          tope_sab: parseInt(nuevo.tope_sab, 10) || 0,
          tope_dom: parseInt(nuevo.tope_dom, 10) || 0,
        }),
      });
      setNuevo({
        nombre: "",
        tope_lun: "540",
        tope_mar: "540",
        tope_mie: "540",
        tope_jue: "540",
        tope_vie: "480",
        tope_sab: "0",
        tope_dom: "0",
      });
      await onReload();
    } finally {
      setSaving(null);
    }
  };

  const asignarArea = async (departamento: string, horario_tipo_id: string) => {
    setSaving(`area-${departamento}`);
    try {
      await fetch("/api/rrhh/asistencia/horarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "asignacion",
          departamento,
          horario_tipo_id: horario_tipo_id ? Number(horario_tipo_id) : null,
        }),
      });
      await onReload();
    } finally {
      setSaving(null);
    }
  };

  const asignacionDe = (a: string) =>
    asignaciones.find((x) => x.departamento === a)?.horario_tipo_id ?? "";

  return (
    <div className="mb-6 rounded-md border p-4 space-y-6">
      <div>
        <h2 className="text-sm font-medium mb-2">
          Tipos de horario (minutos esperados por día)
        </h2>
        <div className="space-y-2">
          {tipos.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-2 rounded border p-2"
            >
              <span className="w-40 text-sm font-medium">{t.nombre}</span>
              {DIAS.map((d) => (
                <div key={d.key} className="flex flex-col items-center">
                  <label className="text-[10px] text-muted-foreground">
                    {d.label}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={valOf(t, d.key)}
                    onChange={(e) => setVal(t, d.key, e.target.value)}
                    className="h-8 w-16"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => guardarTipo(t)}
                disabled={saving === `tipo-${t.id}`}
                className="ml-auto rounded-md border bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving === `tipo-${t.id}` ? "Guardando…" : "Guardar"}
              </button>
            </div>
          ))}
          {tipos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin tipos de horario cargados todavía (falta correr el SQL en la
              base). Mientras tanto se usa el tope fijo de siempre.
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-dashed p-2">
          <div className="flex flex-col">
            <label className="text-[10px] text-muted-foreground">
              Nuevo tipo
            </label>
            <Input
              placeholder="Nombre"
              value={nuevo.nombre}
              onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))}
              className="h-8 w-40"
            />
          </div>
          {DIAS.map((d) => (
            <div key={d.key} className="flex flex-col items-center">
              <label className="text-[10px] text-muted-foreground">
                {d.label}
              </label>
              <Input
                type="number"
                min={0}
                value={(nuevo as any)[d.key]}
                onChange={(e) =>
                  setNuevo((p) => ({ ...p, [d.key]: e.target.value }))
                }
                className="h-8 w-16"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={crearTipo}
            disabled={saving === "nuevo" || !nuevo.nombre.trim()}
            className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {saving === "nuevo" ? "Creando…" : "+ Agregar tipo"}
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-2">Área → tipo de horario</h2>
        {areas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay áreas para mostrar todavía (cargá datos en el rango de
            fechas de la tabla).
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <div
                key={a}
                className="flex items-center gap-2 rounded border p-2"
              >
                <span className="text-sm">{a}</span>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={String(asignacionDe(a))}
                  disabled={saving === `area-${a}`}
                  onChange={(e) => asignarArea(a, e.target.value)}
                >
                  <option value="">Estándar (por defecto)</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
