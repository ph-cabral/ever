"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
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

type Row = {
  employee_no: string;
  employee_name: string | null;
  departamento: string | null;
  fecha: string;
  check_in: string | null;
  check_out: string | null;
  minutos: number | null;
  eventos_dia: number | null;
  devices: string | null;
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
};

const ESTADOS = [
  "Art",
  "Vacaciones",
  "Enfermedad",
  "Fallecimientos",
  "Nac. de hijo",
  "Gira comercial",
  "Ausentismo",
  "Suspención",
  "Acompañamiento familiar",
  "Normal",
  "Ausente",
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

// Tope diario en minutos: viernes 480, fin de semana 0, resto 540.
const topeMin = (fecha: string) => {
  const dow = new Date(`${fecha}T00:00:00`).getDay(); // 0 Dom .. 6 Sab
  if (dow === 5) return 480;
  if (dow === 0 || dow === 6) return 0;
  return 540;
};

// Estado calculado por defecto (uno de: Normal | Ausente | Revisar)
const calcEstado = (r: Row): "Normal" | "Ausente" | "Revisar" => {
  if (!r.check_in) return "Ausente";
  if (!r.check_out) return "Revisar";
  if ((r.minutos ?? 0) < 60) return "Revisar";
  return "Normal";
};

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
    top: number;
    left: number;
    width: number;
  }>({
    top: 0,
    left: 0,
    width: 192,
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLInputElement>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r)
      setCoords({
        top: r.bottom + 4,
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
                left: coords.left,
                width: coords.width,
              }}
              className="z-[100] max-h-72 overflow-auto rounded-md border bg-popover p-1 shadow-md"
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

export default function AsistenciaPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [empleado, setEmpleado] = useState("");
  const [estado, setEstado] = useState<string>("all");
  const [origen, setOrigen] = useState<string>("all");
  const [edits, setEdits] = useState<Record<string, Edit>>({});

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
  const patch = (k: string, p: Edit) =>
    setEdits((prev) => ({ ...prev, [k]: { ...prev[k], ...p } }));

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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (
        empleado &&
        !(r.employee_name ?? "").toLowerCase().includes(empleado.toLowerCase())
      )
        return false;
      if (estado !== "all" && effEstado(r) !== estado) return false;
      if (origen !== "all" && !(r.devices ?? "").includes(origen)) return false;
      return true;
    });
  }, [rows, empleado, estado, origen, edits]);

  return (
    <div className="container mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-medium">Asistencia</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Empleados activos · estado calculado y editable · novedades por día.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
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
        <Select value={origen} onValueChange={setOrigen}>
          <SelectTrigger>
            <SelectValue placeholder="Reloj" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los relojes</SelectItem>
            <SelectItem value="oficina">oficina</SelectItem>
            <SelectItem value="fabrica">fabrica</SelectItem>
            <SelectItem value="lilser">lilser</SelectItem>
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
              <TableHead>Origen</TableHead>
              <TableHead>Ingreso</TableHead>
              <TableHead>Egreso</TableHead>
              <TableHead>En empresa</TableHead>
              <TableHead>RRHH</TableHead>
              <TableHead>Estado / Días</TableHead>
              <TableHead className="text-right">Novedad / Horas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-8 text-muted-foreground"
                >
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-8 text-muted-foreground"
                >
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => {
              const k = keyOf(r);
              const e = edits[k] ?? {};
              const est = e.estado ?? calcEstado(r);
              const horasNov = parseInt(e.horas || "0", 10) || 0;
              const netMin = Math.max(0, (r.minutos ?? 0) - horasNov * 60);
              const rrhhMin = Math.min(netMin, topeMin(r.fecha));
              return (
                <TableRow key={`${k}-${r.devices}`}>
                  <TableCell>
                    <Link
                      href={`/rrhh/asistencia/${r.employee_no}?desde=${desde}&hasta=${hasta}`}
                      className="text-primary hover:underline"
                    >
                      {r.employee_name ?? `#${r.employee_no}`}
                    </Link>
                  </TableCell>
                  <TableCell>{r.fecha}</TableCell>
                  <TableCell>
                    {r.devices ? (
                      <button
                        onClick={() => setOrigen((r.devices ?? "").trim())}
                        className="text-primary hover:underline"
                      >
                        {r.devices}
                      </button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{fmtTime(r.check_in)}</TableCell>
                  <TableCell>{fmtTime(r.check_out)}</TableCell>
                  <TableCell
                    title={
                      horasNov
                        ? `Bruto ${fmtHHMM(r.minutos)} − ${horasNov} hs`
                        : undefined
                    }
                  >
                    {fmtHHMM(netMin)}
                  </TableCell>
                  <TableCell
                    title={`Neto ${fmtHHMM(netMin)} · tope ${fmtHHMM(topeMin(r.fecha))}`}
                  >
                    {fmtHHMM(rrhhMin)}
                  </TableCell>
                  <TableCell>
                    <Picker
                      value={est}
                      options={ESTADOS}
                      toneClass={estadoTone(est)}
                      numValue={e.dias}
                      numLabel="días"
                      placeholder="Estado"
                      onPick={(v) => patch(k, { estado: v })}
                      onNum={(v) => patch(k, { dias: v })}
                      onCommit={() => commit(k, "estado")}
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
                        onPick={(v) => patch(k, { novedad: v })}
                        onNum={(v) => patch(k, { horas: v })}
                        onCommit={() => commit(k, "novedad", r.minutos ?? 0)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
