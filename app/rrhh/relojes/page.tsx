"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserPlus, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

type Empleado = {
  employeeNo: string;
  name: string;
  userType?: string;
  relojes: string[];
};

type ResultadoCrear = {
  reloj: string;
  ip: string;
  ok: boolean;
  error: string | null;
};

const RELOJES_DISPONIBLES = [
  { ip: "10.10.0.12", nombre: "Oficina" },
  { ip: "10.10.0.30", nombre: "Fabrica" },
  { ip: "10.10.0.92", nombre: "Lilser" },
];

type Tab = "lista" | "crear";

const FORM_VACIO = {
  employeeNo: "",
  name: "",
  userType: "normal",
  gender: "unknown", // ← nuevo
  password: "",
  ips: [] as string[],
};

export default function RelojEmpPage() {
  const [tab, setTab] = useState<Tab>("lista");

  // ── Lista ──────────────────────────────────────────────
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroReloj, setFiltroReloj] = useState("all");

  const fetchLista = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/rrhh/relojes/empleados");
      const data = await res.json();
      setEmpleados(data.empleados ?? []);
      setErrores(data.errores ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setErrores(["Error de red al consultar los relojes"]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    fetchLista();
  }, [fetchLista]);

  const filtrados = useMemo(() => {
    return empleados.filter((e) => {
      const matchBusq =
        !busqueda ||
        (e.name ?? "").toLowerCase().includes(busqueda.toLowerCase()) ||
        e.employeeNo.includes(busqueda);
      const matchReloj =
        filtroReloj === "all" || e.relojes.includes(filtroReloj);
      return matchBusq && matchReloj;
    });
  }, [empleados, busqueda, filtroReloj]);

  // ── Crear ──────────────────────────────────────────────
  const [form, setForm] = useState(FORM_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoCrear[] | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const toggleReloj = (ip: string) => {
    setForm((f) => ({
      ...f,
      ips: f.ips.includes(ip) ? f.ips.filter((x) => x !== ip) : [...f.ips, ip],
    }));
  };

  const handleCrear = async () => {
    if (!form.employeeNo.trim() || !form.name.trim()) {
      setErrorForm("ID y nombre son obligatorios");
      return;
    }
    setErrorForm(null);
    setEnviando(true);
    setResultados(null);
    try {
      const body = {
        employeeNo: form.employeeNo.trim(),
        name: form.name.trim(),
        userType: form.userType,
        gender: form.gender,
        ...(form.password ? { password: form.password } : {}),
        // ips vacío = todos
        ...(form.ips.length ? { ips: form.ips } : {}),
      };
      const res = await fetch("/api/rrhh/relojes/empleados/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResultados(data.resultados);

      const todoOk = data.resultados.every((r: ResultadoCrear) => r.ok);
      if (todoOk) {
        setForm(FORM_VACIO);
        // Refrescar lista automáticamente
        fetchLista();
      }
    } catch {
      setErrorForm("Error de red al crear el usuario");
    } finally {
      setEnviando(false);
    }
  };

  // ──────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-6 py-8 max-w-5xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Relojes · Empleados</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Usuarios registrados en los relojes Hikvision.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === "lista" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("lista")}
          >
            Lista
          </Button>
          <Button
            variant={tab === "crear" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setTab("crear");
              setResultados(null);
            }}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Nuevo usuario
          </Button>
        </div>
      </header>

      {/* ── TAB LISTA ─────────────────────────────────── */}
      {tab === "lista" && (
        <>
          {errores.length > 0 && (
            <div className="mb-4 space-y-1">
              {errores.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded px-3 py-2"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {e}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 mb-4">
            <Input
              placeholder="Buscar por nombre o ID…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="max-w-xs"
            />
            <Select value={filtroReloj} onValueChange={setFiltroReloj}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Reloj" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los relojes</SelectItem>
                {RELOJES_DISPONIBLES.map((r) => (
                  <SelectItem key={r.ip} value={r.nombre}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchLista}
              disabled={cargando}
              title="Recargar"
            >
              <RefreshCw
                className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`}
              />
            </Button>
            <span className="ml-auto text-sm text-muted-foreground self-center">
              {cargando
                ? "Cargando…"
                : `${filtrados.length} / ${total} empleados`}
            </span>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">ID</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-24">Tipo</TableHead>
                  <TableHead>Relojes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargando && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Consultando relojes…
                    </TableCell>
                  </TableRow>
                )}
                {!cargando && filtrados.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Sin resultados
                    </TableCell>
                  </TableRow>
                )}
                {!cargando &&
                  filtrados.map((e) => (
                    <TableRow key={e.employeeNo}>
                      <TableCell className="font-mono text-xs">
                        {e.employeeNo}
                      </TableCell>
                      <TableCell>{e.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">
                        {e.userType ?? "normal"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {e.relojes.map((r) => (
                            <Badge
                              key={r}
                              variant="secondary"
                              className="text-xs"
                            >
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── TAB CREAR ─────────────────────────────────── */}
      {tab === "crear" && (
        <div className="max-w-lg space-y-5">
          <div className="space-y-1">
            <Label htmlFor="employeeNo">ID de empleado *</Label>
            <Input
              id="employeeNo"
              placeholder="Ej: 633"
              value={form.employeeNo}
              onChange={(e) =>
                setForm((f) => ({ ...f, employeeNo: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Debe ser único en todos los relojes donde se va a registrar.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="name">Nombre completo *</Label>
            <Input
              id="name"
              placeholder="Apellido Nombre"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label>Tipo de usuario</Label>
            <Select
              value={form.userType}
              onValueChange={(v) => setForm((f) => ({ ...f, userType: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="visitor">Visitante</SelectItem>
                <SelectItem value="blackList">Lista negra</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sexo</Label>
            <Select
              value={form.gender}
              onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Masculino</SelectItem>
                <SelectItem value="female">Femenino</SelectItem>
                <SelectItem value="unknown">Sin especificar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">Contraseña (opcional)</Label>
            <Input
              id="password"
              type="password"
              placeholder="PIN numérico"
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Relojes destino</Label>
            <p className="text-xs text-muted-foreground">
              Sin selección = se crea en los 3 relojes.
            </p>
            <div className="flex gap-3 flex-wrap">
              {RELOJES_DISPONIBLES.map((r) => (
                <button
                  key={r.ip}
                  type="button"
                  onClick={() => toggleReloj(r.ip)}
                  className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                    form.ips.includes(r.ip)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  }`}
                >
                  {r.nombre}
                </button>
              ))}
            </div>
          </div>

          {errorForm && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {errorForm}
            </p>
          )}

          {resultados && (
            <div className="space-y-2">
              {resultados.map((r) => (
                <div
                  key={r.ip}
                  className={`flex items-start gap-2 rounded px-3 py-2 text-sm ${
                    r.ok
                      ? "bg-green-500/10 text-green-700 dark:text-green-400"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {r.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <span>
                    <strong>{r.reloj}</strong>:{" "}
                    {r.ok ? "Usuario creado correctamente" : r.error}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={handleCrear} disabled={enviando}>
              {enviando ? "Creando…" : "Crear usuario"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setForm(FORM_VACIO);
                setResultados(null);
                setErrorForm(null);
              }}
            >
              Limpiar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import {
  Users,
  UserPlus,
  FileBarChart,
  LayoutDashboard,
  Clock,
} from "lucide-react";