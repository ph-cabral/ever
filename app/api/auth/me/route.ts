import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  // hasUsers permite a /login mostrar el alta del primer admin (bootstrap).
  const hasUsers = (await prisma.usuario.count()) > 0;
  if (!s) return NextResponse.json({ usuario: null, hasUsers });
  return NextResponse.json({
    hasUsers,
    usuario: {
      uid: s.uid,
      dni: s.dni,
      nombre: s.nombre,
      rol: s.rol,
      mods: s.mods,
    },
  });
}
