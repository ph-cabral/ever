"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";

type Row = {
  employee_no: string;
  employee_name: string | null;
  fecha: string;
  check_in: string | null;
  check_out: string | null;
  minutos: number | null;
  eventos_dia: number | null;
  devices: string | null;
};

// Fecha local (AR) en formato YYYY-MM-DD. No usar toISOString() porque eso da UTC
// y a la noche en AR ya está al día siguiente.
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

const getEstado = (r: Row): "NORMAL" | "REVISAR" | "INCOMPLETA" => {
  if (!r.check_out) return "INCOMPLETA";
  if ((r.minutos ?? 0) < 60) return "REVISAR";
  return "NORMAL";
};

export default function AsistenciaPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [empleado, setEmpleado] = useState("");
  const [estado, setEstado] = useState<string>("all");
  const [origen, setOrigen] = useState<string>("all");

  // Default: hoy → hoy (un solo día)
  const [desde, setDesde] = useState(todayLocal());
  const [hasta, setHasta] = useState(todayLocal());

  // Marca si el usuario ya tocó "hasta" manualmente. Mientras no lo haga,
  // cambiar "desde" arrastra "hasta" al mismo valor.
  const hastaTouched = useRef(false);

  const onDesdeChange = (v: string) => {
    setDesde(v);
    if (!hastaTouched.current) setHasta(v);
    else if (v > hasta) setHasta(v); // nunca dejar hasta < desde
  };
  const onHastaChange = (v: string) => {
    hastaTouched.current = true;
    setHasta(v);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ desde, hasta });
      const r = await fetch(`/api/rrhh/asistencia/resumen?${qs}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        console.error(err);
        setRows([]);
        return;
      }
      setRows(await r.json());
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (
        empleado &&
        !(r.employee_name ?? "").toLowerCase().includes(empleado.toLowerCase())
      )
        return false;
      if (estado !== "all" && getEstado(r) !== estado) return false;
      if (origen !== "all" && !(r.devices ?? "").includes(origen)) return false;
      return true;
    });
  }, [rows, empleado, estado, origen]);

  const badgeFor = (s: string) => {
    const variant =
      s === "NORMAL"
        ? "default"
        : s === "REVISAR"
          ? "destructive"
          : "secondary";
    return <Badge variant={variant as any}>{s}</Badge>;
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-medium">Asistencia</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Marcas de los relojes Hikvision · una fila por empleado/día/reloj.
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
            <SelectItem value="NORMAL">NORMAL</SelectItem>
            <SelectItem value="REVISAR">REVISAR</SelectItem>
            <SelectItem value="INCOMPLETA">INCOMPLETA</SelectItem>
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
              <TableHead>Horas</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r, i) => (
              <TableRow key={`${r.employee_no}-${r.fecha}-${r.devices}-${i}`}>
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
                  <button
                    onClick={() => setOrigen((r.devices ?? "").trim())}
                    className="text-primary hover:underline"
                  >
                    {r.devices}
                  </button>
                </TableCell>
                <TableCell>{fmtTime(r.check_in)}</TableCell>
                <TableCell>{fmtTime(r.check_out)}</TableCell>
                <TableCell>{fmtHHMM(r.minutos)}</TableCell>
                <TableCell>{badgeFor(getEstado(r))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}