import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { guardAltaUsuario } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Alta de usuario vinculada a un legajo existente (por DNI).
// Sólo ADMIN; salvo bootstrap (primer usuario => ADMIN).
export async function POST(req: NextRequest) {
  const g = await guardAltaUsuario();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const dni = String(body?.dni ?? "").trim();
  const password = String(body?.password ?? "");
  const rolPedido = body?.rol === "ADMIN" ? "ADMIN" : "USUARIO";

  if (!dni) return NextResponse.json({ error: "Falta el DNI" }, { status: 400 });
  if (password.length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres" },
      { status: 400 },
    );
  }

  const legajo = await prisma.legajo.findUnique({
    where: { dni },
    select: {
      id: true,
      nombre: true,
      sector: true,
      sectorRel: { select: { nombre: true } },
      usuario: { select: { id: true } },
    },
  });
  if (!legajo) {
    return NextResponse.json(
      { error: "No existe un legajo de everwear con ese DNI" },
      { status: 404 },
    );
  }
  if (legajo.usuario) {
    return NextResponse.json({ error: "Ese legajo ya tiene un usuario" }, { status: 409 });
  }

  // En bootstrap el primer usuario siempre es ADMIN.
  const rol = g.bootstrap ? "ADMIN" : rolPedido;
  // Sector efectivo: la relación (tabla sector) manda; si no, el string libre.
  const sector = legajo.sectorRel?.nombre ?? legajo.sector ?? null;

  try {
    const usuario = await prisma.usuario.create({
      data: {
        legajoId: legajo.id,
        dni,
        nombre: legajo.nombre,
        passwordHash: hashPassword(password),
        rol,
        sector,
      },
      select: { id: true, nombre: true, rol: true, sector: true },
    });
    return NextResponse.json({ ok: true, bootstrap: g.bootstrap, usuario }, { status: 201 });
  } catch (e: any) {
    const dup = e?.code === "P2002";
    return NextResponse.json(
      { error: dup ? "Ya existe un usuario para ese DNI/legajo" : "Error al crear usuario" },
      { status: dup ? 409 : 500 },
    );
  }
}
