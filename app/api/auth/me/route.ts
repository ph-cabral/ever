import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  // hasUsers permite a /login mostrar el alta del primer admin (bootstrap).
  // dbReady=false => la tabla everwear.usuario no existe o falta `prisma generate`.
  let hasUsers = false;
  let dbReady = true;
  try {
    hasUsers = (await prisma.usuario.count()) > 0;
  } catch {
    dbReady = false;
  }
  if (!s) return NextResponse.json({ usuario: null, hasUsers, dbReady });
  return NextResponse.json({
    hasUsers,
    dbReady,
    usuario: {
      uid: s.uid,
      dni: s.dni,
      nombre: s.nombre,
      rol: s.rol,
      mods: s.mods,
    },
  });
}
