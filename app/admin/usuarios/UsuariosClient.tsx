"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, UserPlus, ShieldCheck, ShieldOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type U = {
  id: number;
  dni: string;
  nombre: string;
  rol: string;
  sector: string | null;
  vendedorCodigo: number | null;
  activo: boolean;
  ultimoAcceso: string | null;
  createdAt: string;
};

type Vendedor = { codigo: number; nombre: string | null };

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function UsuariosClient() {
  const [items, setItems] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [resetUser, setResetUser] = useState<U | null>(null);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  // Catálogo de vendedores (Magnus, Ped_Usu_Arma) para el selector de la
  // columna "Vendedor" — pedido de Pablo 2026-08-14, acceso por vendedor en
  // /ventas/vendedor. Se trae una sola vez, catálogo chico.
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedoresError, setVendedoresError] = useState(false);

  const puedeResetear = pwd.length >= 6 && pwd === pwd2;

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/usuarios");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      setItems(d.items);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch("/api/admin/usuarios/vendedores")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.vendedores)) setVendedores(d.vendedores);
        else setVendedoresError(true);
      })
      .catch(() => setVendedoresError(true));
  }, []);

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      toast.success("Usuario actualizado");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar");
    } finally {
      setBusy(null);
    }
  }

  function openReset(u: U) {
    setResetUser(u);
    setPwd("");
    setPwd2("");
  }

  function closeReset() {
    setResetUser(null);
    setPwd("");
    setPwd2("");
  }

  async function resetPassword() {
    if (!resetUser || !puedeResetear) return;
    setSavingPwd(true);
    try {
      const r = await fetch(`/api/admin/usuarios/${resetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      toast.success(`Contraseña de ${resetUser.nombre} actualizada`);
      closeReset();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar la contraseña");
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-medium">Usuarios</h1>
        <span className="text-sm text-muted-foreground">({items.length})</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refrescar
          </Button>
          <Link href="/admin/usuarios/nuevo" className={buttonVariants({ size: "sm" })}>
            <UserPlus /> Nuevo
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">DNI</th>
              <th className="px-3 py-2 font-medium">Sector</th>
              <th className="px-3 py-2 font-medium">Vendedor</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Último acceso</th>
              <th className="px-3 py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="inline size-5 animate-spin" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  Todavía no hay usuarios.
                </td>
              </tr>
            ) : (
              items.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-2">{u.nombre}</td>
                  <td className="px-3 py-2 tabular-nums">{u.dni}</td>
                  <td className="px-3 py-2">{u.sector || "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.vendedorCodigo ?? ""}
                      disabled={busy === u.id || (vendedores.length === 0 && !vendedoresError)}
                      onChange={(e) =>
                        patch(u.id, {
                          vendedorCodigo: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      title={
                        vendedoresError
                          ? "No se pudo cargar el catálogo de vendedores de Magnus"
                          : "Vendedor de Magnus asignado a este usuario (acceso en /ventas/vendedor)"
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-50"
                    >
                      <option value="">Sin asignar</option>
                      {vendedores.map((v) => (
                        <option key={v.codigo} value={v.codigo}>
                          {v.nombre ?? `Código ${v.codigo}`}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        u.rol === "ADMIN"
                          ? "rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-xs"
                          : "rounded-full bg-secondary px-2 py-0.5 text-xs"
                      }
                    >
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {u.activo ? (
                      <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs">activo</span>
                    ) : (
                      <span className="rounded-full bg-gray-200 text-gray-600 px-2 py-0.5 text-xs">inactivo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(u.ultimoAcceso)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={busy === u.id}
                        onClick={() => openReset(u)}
                      >
                        <KeyRound /> Contraseña
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={busy === u.id}
                        onClick={() => patch(u.id, { rol: u.rol === "ADMIN" ? "USUARIO" : "ADMIN" })}
                      >
                        {u.rol === "ADMIN" ? <ShieldOff /> : <ShieldCheck />}
                        {u.rol === "ADMIN" ? "Quitar admin" : "Hacer admin"}
                      </Button>
                      <Button
                        variant={u.activo ? "destructive" : "secondary"}
                        size="xs"
                        disabled={busy === u.id}
                        onClick={() => patch(u.id, { activo: !u.activo })}
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Nota: los cambios de rol o de permisos se aplican la próxima vez que la persona inicia sesión. El
        vendedor asignado, en cambio, se aplica al toque (no hace falta relogin).
      </p>

      {resetUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !savingPwd && closeReset()}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-background p-4 shadow-lg ring-1 ring-foreground/10 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="flex items-center gap-1.5 text-base font-medium">
                <KeyRound className="size-4" /> Cambiar contraseña
              </h2>
              <p className="text-sm text-muted-foreground">
                {resetUser.nombre} · DNI {resetUser.dni}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newpass">Nueva contraseña</Label>
              <Input
                id="newpass"
                type="password"
                autoFocus
                placeholder="mín. 6 caracteres"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newpass2">Repetir contraseña</Label>
              <Input
                id="newpass2"
                type="password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && puedeResetear && resetPassword()}
              />
            </div>
            {pwd2.length > 0 && pwd !== pwd2 && (
              <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeReset} disabled={savingPwd}>
                Cancelar
              </Button>
              <Button size="sm" onClick={resetPassword} disabled={!puedeResetear || savingPwd}>
                {savingPwd ? "Guardando…" : "Guardar"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              La persona ingresa con esta contraseña en su próximo inicio de sesión.
              Comunicásela de forma segura.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
