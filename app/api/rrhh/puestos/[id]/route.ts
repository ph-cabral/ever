// PATCH/DELETE de un puesto. Si cambian las asignaciones de documentos
// (documentoIds), se re-indexan esos documentos en Qdrant (el payload incluye
// los nombres de puestos).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ragSyncDocumentos } from "@/lib/rrhh/vickiRag";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.nombre !== undefined) data.nombre = String(body.nombre).trim();
  if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion) : null;
  if (body.sectorId !== undefined) {
    if (!body.sectorId) return NextResponse.json({ error: "Falta el sector" }, { status: 400 });
    data.sectorId = Number(body.sectorId);
  }
  if (body.activo !== undefined) data.activo = Boolean(body.activo);

  try {
    let afectados: number[] = [];
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.puesto.update({ where: { id }, data });
      if (Array.isArray(body.documentoIds)) {
        const previos = await tx.puesto_documento.findMany({ where: { puestoId: id } });
        const nuevos: number[] = body.documentoIds.map(Number).filter(Number.isInteger);
        await tx.puesto_documento.deleteMany({ where: { puestoId: id } });
        if (nuevos.length) {
          await tx.puesto_documento.createMany({
            data: nuevos.map((documentoId) => ({ puestoId: id, documentoId })),
            skipDuplicates: true,
          });
        }
        // re-indexar los que entraron o salieron
        afectados = [...new Set([...previos.map((p) => p.documentoId), ...nuevos])];
      }
    });
    // el nombre del puesto también vive en el payload de Qdrant de sus documentos
    if (data.nombre !== undefined && !afectados.length) {
      const links = await prisma.puesto_documento.findMany({ where: { puestoId: id } });
      afectados = links.map((l) => l.documentoId);
    }
    const rag = afectados.length ? await ragSyncDocumentos(afectados) : { ragOk: true };
    return NextResponse.json({ ok: true, ...rag });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  try {
    const links = await prisma.puesto_documento.findMany({ where: { puestoId: id } });
    await prisma.puesto.delete({ where: { id } }); // cascade borra los links
    const rag = links.length ? await ragSyncDocumentos(links.map((l) => l.documentoId)) : { ragOk: true };
    return NextResponse.json({ ok: true, ...rag });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
