// GET/PATCH/DELETE de un documento. PATCH re-indexa en Qdrant (y sube version
// si cambió el contenido); vigente=false lo saca del índice sin borrarlo de
// Postgres. DELETE borra de ambos lados.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ragDeleteDocumento, ragSyncDocumento } from "@/lib/rrhh/vickiRag";

export const dynamic = "force-dynamic";

const TIPOS = new Set(["procedimiento", "instructivo"]);
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const doc = await prisma.documento.findUnique({
    where: { id },
    include: { puestos: { select: { puestoId: true, puesto: { select: { nombre: true } } } } },
  });
  if (!doc) return NextResponse.json({ error: "no existe" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const body = await req.json();

  const actual = await prisma.documento.findUnique({ where: { id } });
  if (!actual) return NextResponse.json({ error: "no existe" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.titulo !== undefined) data.titulo = String(body.titulo).trim();
  if (body.tipo !== undefined) {
    if (!TIPOS.has(String(body.tipo))) return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
    data.tipo = String(body.tipo);
  }
  if (body.vigente !== undefined) data.vigente = Boolean(body.vigente);
  if (body.contenido !== undefined) {
    const contenido = String(body.contenido).trim();
    if (!contenido) return NextResponse.json({ error: "Falta el contenido" }, { status: 400 });
    data.contenido = contenido;
    if (contenido !== actual.contenido) data.version = actual.version + 1;
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.documento.update({ where: { id }, data });
      if (Array.isArray(body.puestoIds)) {
        const puestoIds: number[] = body.puestoIds.map(Number).filter(Number.isInteger);
        await tx.puesto_documento.deleteMany({ where: { documentoId: id } });
        if (puestoIds.length) {
          await tx.puesto_documento.createMany({
            data: puestoIds.map((puestoId) => ({ puestoId, documentoId: id })),
            skipDuplicates: true,
          });
        }
      }
    });
    const rag = await ragSyncDocumento(id); // vigente=false → borra del índice
    const doc = await prisma.documento.findUnique({
      where: { id },
      include: { puestos: { select: { puestoId: true, puesto: { select: { nombre: true } } } } },
    });
    return NextResponse.json({ ...doc, ...rag });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  try {
    await prisma.documento.delete({ where: { id } }); // cascade borra los links
    const rag = await ragDeleteDocumento(id);
    return NextResponse.json({ ok: true, ...rag });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
