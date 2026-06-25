import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Activar/desactivar o cambiar el rol de un usuario.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const data: { activo?: boolean; rol?: string } = {};
  if (typeof body?.activo === "boolean") data.activo = body.activo;
  if (body?.rol === "ADMIN" || body?.rol === "USUARIO") data.rol = body.rol;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  // No dejar el sistema sin ningún admin activo.
  const quitaAdmin = data.activo === false || data.rol === "USUARIO";
  if (quitaAdmin) {
    const target = await prisma.usuario.findUnique({ where: { id }, select: { rol: true } });
    if (target?.rol === "ADMIN") {
      const otros = await prisma.usuario.count({
        where: { rol: "ADMIN", activo: true, id: { not: id } },
      });
      if (otros === 0) {
        return NextResponse.json(
          { error: "No podés dejar el sistema sin un admin activo" },
          { status: 409 },
        );
      }
    }
  }

  try {
    const usuario = await prisma.usuario.update({
      where: { id },
      data,
      select: { id: true, nombre: true, rol: true, activo: true },
    });
    return NextResponse.json({ ok: true, usuario });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  }
}
