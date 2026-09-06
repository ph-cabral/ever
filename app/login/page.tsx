"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CrearUsuarioForm } from "@/components/auth/CrearUsuarioForm";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [bootstrap, setBootstrap] = useState(false);
  const [setupError, setSetupError] = useState(false);
  const [dni, setDni] = useState("");
  const [password, setPassword] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me");
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.dbReady === false) {
          // La tabla everwear.usuario no existe o falta `prisma generate`.
          setSetupError(true);
          return;
        }
        if (data.usuario) {
          router.replace(returnTo());
          return;
        }
        setBootstrap(!data.hasUsers);
      } catch {
        setSetupError(true);
      } finally {
        setChecking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function returnTo() {
    if (typeof window === "undefined") return "/";
    const rt = new URLSearchParams(window.location.search).get("returnTo");
    return rt && rt.startsWith("/") ? rt : "/";
  }

  async function ingresar() {
    if (!dni.trim() || !password) return;
    setEntrando(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni: dni.trim(), password }),
      });
      // Un 500 del route handler viene con body vacío: sin este catch, el
      // .json() explota con "Unexpected end of JSON input" y tapa el error real
      // (típico: la tabla everwear.usuario no tiene alguna columna que
      // prisma/schema.prisma sí declara).
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(
          data?.error ?? `No se pudo iniciar sesión (error ${r.status} del servidor)`,
        );
      }
      router.replace(returnTo());
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al iniciar sesión");
      setEntrando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">
            {setupError
              ? "Falta configurar la base"
              : bootstrap
                ? "Crear primer usuario"
                : "EverWear · Ingresar"}
          </CardTitle>
          <CardDescription>
            {setupError
              ? "No se puede leer la tabla de usuarios."
              : bootstrap
                ? "No hay usuarios todavía. El primero queda como administrador."
                : "Ingresá con tu DNI y contraseña."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checking ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : setupError ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-start gap-2 text-destructive">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>
                  La tabla <code>everwear.usuario</code> no existe o el cliente de Prisma no
                  está generado.
                </span>
              </div>
              <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
                <li>
                  Aplicá el SQL: <code>psql &quot;$DATABASE_URL&quot; -f sql/usuario_auth.sql</code>
                </li>
                <li>
                  Regenerá Prisma: <code>npx prisma generate</code> (y reiniciá/redeployá la app)
                </li>
              </ol>
              <Button variant="outline" onClick={() => location.reload()}>
                Reintentar
              </Button>
            </div>
          ) : bootstrap ? (
            <CrearUsuarioForm
              mode="bootstrap"
              onCreated={(u) => {
                setBootstrap(false);
                setDni(u.dni);
                toast.success("Listo. Iniciá sesión con la contraseña que pusiste.");
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dni">DNI</Label>
                <Input
                  id="dni"
                  inputMode="numeric"
                  autoFocus
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ingresar()}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ingresar()}
                />
              </div>
              <Button onClick={ingresar} disabled={entrando || !dni.trim() || !password}>
                {entrando ? <Loader2 className="animate-spin" /> : <LogIn />}
                {entrando ? "Ingresando…" : "Ingresar"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
