// CRUD de procedimientos/instructivos. Al crear se indexa en Qdrant vía
// vicki_chat (best-effort: ragOk=false si vicki_chat no respondió).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ragSyncDocumento } from "@/lib/rrhh/vickiRag";

export const dynamic = "force-dynamic";

const TIPOS = new Set(["procedimiento", "instructivo"]);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo") ?? undefined;
  const puestoId = sp.get("puestoId") ? Number(sp.get("puestoId")) : undefined;
  const q = (sp.get("q") ?? "").trim();

  const docs = await prisma.documento.findMany({
    where: {
      ...(tipo && TIPOS.has(tipo) ? { tipo } : {}),
      ...(puestoId ? { puestos: { some: { puestoId } } } : {}),
      ...(q ? { OR: [
        { titulo: { contains: q, mode: "insensitive" } },
        { contenido: { contains: q, mode: "insensitive" } },
      ] } : {}),
    },
    orderBy: [{ tipo: "asc" }, { titulo: "asc" }],
    include: { puestos: { select: { puestoId: true, puesto: { select: { nombre: true } } } } },
  });
  return NextResponse.json(docs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const titulo = String(body?.titulo ?? "").trim();
  const contenido = String(body?.contenido ?? "").trim();
  const tipo = String(body?.tipo ?? "procedimiento");
  if (!titulo) return NextResponse.json({ error: "Falta el título" }, { status: 400 });
  if (!contenido) return NextResponse.json({ error: "Falta el contenido" }, { status: 400 });
  if (!TIPOS.has(tipo)) return NextResponse.json({ error: "tipo inválido" }, { status: 400 });

  const puestoIds: number[] = Array.isArray(body?.puestoIds)
    ? body.puestoIds.map(Number).filter(Number.isInteger)
    : [];

  try {
    const doc = await prisma.documento.create({
      data: {
        tipo, titulo, contenido,
        puestos: { create: puestoIds.map((puestoId) => ({ puestoId })) },
      },
    });
    const rag = await ragSyncDocumento(doc.id);
    return NextResponse.json({ ...doc, ...rag }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
