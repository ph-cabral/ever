"use client";

import { useEffect, useState, useCallback, useMemo, use } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Ev = {
  device: string;
  employee_no: string;
  employee_name: string | null;
  event_time: string;
  tipo: string | null;
  major: number | null;
  minor: number | null;
  area: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function AsistenciaEmpleadoPage({
  params,
}: { params: Promise<{ employee_no: string }> }) {
  const { employee_no } = use(params);
  const [evs, setEvs] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(false);
  const [area, setArea] = useState("all");
  const [tipo, setTipo] = useState("all");
  const [desde, setDesde] = useState(daysAgo(30));
  const [hasta, setHasta] = useState(today());

  const areas = useMemo(
    () =>
      [...new Set(evs.map((e) => e.area).filter(Boolean) as string[])].sort(),
    [evs],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        employee_no,
        desde: `${desde}T00:00:00-03:00`,
        hasta: `${hasta}T23:59:59-03:00`,
      });
      const r = await fetch(`/api/rrhh/asistencia/eventos?${qs}`);
      setEvs(await r.json());
    } finally { setLoading(false); }
    
  },
  [employee_no, desde, hasta]
);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    return evs.filter((e) => {
      if (area !== "all" && (e.area ?? "") !== area) return false;
      if (tipo !== "all" && e.tipo !== tipo) return false;
      return true;
    });
  }, [evs, area, tipo]);

  const nombre = evs[0]?.employee_name ?? `#${employee_no}`;
  const dias = new Set(filtered.map((e) => e.event_time.slice(0, 10))).size;

  return (
    <div className="container mx-auto px-6 py-8">
      <Link
        href="/rrhh/asistencia"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> Asistencia
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-medium">{nombre}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Legajo #{employee_no} · {filtered.length} marcas en {dias} días
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        {/* <Select value={origen} onValueChange={setOrigen}>
          <SelectTrigger><SelectValue placeholder="Reloj" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los relojes</SelectItem>
            <SelectItem value="oficina">oficina</SelectItem>
            <SelectItem value="fabrica">fabrica</SelectItem>
            <SelectItem value="lilser">lilser</SelectItem>
          </SelectContent>
        </Select> */}
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
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="ENTRADA">ENTRADA</SelectItem>
            <SelectItem value="SALIDA">SALIDA</SelectItem>
          </SelectContent>
        </Select>
        <DateField value={desde} onChange={setDesde} />
        <DateField value={hasta} onChange={setHasta} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Reloj</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-8 text-muted-foreground"
                >
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-8 text-muted-foreground"
                >
                  Sin marcas
                </TableCell>
              </TableRow>
            )}
            {filtered.map((e, i) => {
              const dt = new Date(e.event_time);
              return (
                <TableRow key={i}>
                  <TableCell>{dt.toLocaleDateString("es-AR")}</TableCell>
                  <TableCell>
                    {dt.toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={e.tipo === "ENTRADA" ? "default" : "secondary"}
                    >
                      {e.tipo ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>{e.device}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
