import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sistema/opciones?clave=sistema
// Devuelve { [campo]: string[] } con las opciones dinámicas de esa clave de tablero.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clave = searchParams.get("clave");
  if (!clave) return NextResponse.json({ error: "Falta clave" }, { status: 400 });

  try {
    const rows = await prisma.sistema_opcion.findMany({
      where: { clave },
      orderBy: [{ orden: "asc" }, { id: "asc" }],
    });
    const result: Record<string, string[]> = {};
    for (const r of rows) {
      (result[r.campo] ??= []).push(r.valor);
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/sistema/opciones", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST /api/sistema/opciones  { clave, campo, valor }
// Agrega una opción nueva (si no existía) y devuelve la lista actualizada de ese campo.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const clave = String(body.clave ?? "").trim();
    const campo = String(body.campo ?? "").trim();
    const valor = String(body.valor ?? "").trim();
    if (!clave || !campo || !valor) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const count = await prisma.sistema_opcion.count({ where: { clave, campo } });
    await prisma.sistema_opcion.upsert({
      where: { clave_campo_valor: { clave, campo, valor } },
      update: {},
      create: { clave, campo, valor, orden: count },
    });

    const rows = await prisma.sistema_opcion.findMany({
      where: { clave, campo },
      orderBy: [{ orden: "asc" }, { id: "asc" }],
    });
    return NextResponse.json(rows.map((r) => r.valor));
  } catch (error) {
    console.error("POST /api/sistema/opciones", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
