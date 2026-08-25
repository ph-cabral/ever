// GET/PATCH/DELETE de un documento. PATCH re-indexa en Qdrant (y sube version
// si cambió el contenido); vigente=false lo saca del índice sin borrarlo de
// Postgres. DELETE borra de ambos lados (y del disco).
//
// Desde que la carga es por archivo, la UI solo usa PATCH para `vigente`: el
// contenido se actualiza reemplazando el archivo (ver [id]/archivo/route.ts).
// El resto del PATCH queda para la API.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
// /api/rrhh/documentos está EXCLUIDA del matcher del middleware (bug de Next 15.5
// con multipart, ver middleware.ts): el permiso se chequea acá.
import { bloqueoPorAcceso } from "@/lib/auth/guard";
import { ragDeleteDocumento, ragSyncDocumento } from "@/lib/rrhh/vickiRag";
import { TIPOS, chequearUnicaDescripcion } from "@/lib/rrhh/documentosTipos";
import { rutaAdjunto } from "@/lib/rrhh/documentosArchivo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const bloqueo = await bloqueoPorAcceso("/api/rrhh/documentos");
  if (bloqueo) return bloqueo;
  const id = Number((await params).id);
  const doc = await prisma.documento.findUnique({
    where: { id },
    include: { puestos: { select: { puestoId: true, puesto: { select: { nombre: true } } } } },
  });
  if (!doc) return NextResponse.json({ error: "no existe" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const bloqueo = await bloqueoPorAcceso("/api/rrhh/documentos");
  if (bloqueo) return bloqueo;
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

  // Una sola descripción de puesto por puesto. Se evalúa con el estado FINAL
  // (el tipo que queda después del PATCH y los puestos que queda asignados),
  // excluyendo este mismo documento — si no, editarlo chocaría consigo mismo.
  const tipoFinal = (data.tipo as string) ?? actual.tipo;
  const puestoIdsFinal: number[] = Array.isArray(body.puestoIds)
    ? body.puestoIds.map(Number).filter(Number.isInteger)
    : (await prisma.puesto_documento.findMany({ where: { documentoId: id }, select: { puestoId: true } }))
        .map((l) => l.puestoId);
  const choque = await chequearUnicaDescripcion(tipoFinal, puestoIdsFinal, id);
  if (choque) return NextResponse.json({ error: choque }, { status: 409 });

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
  const bloqueo = await bloqueoPorAcceso("/api/rrhh/documentos");
  if (bloqueo) return bloqueo;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  try {
    const doc = await prisma.documento.findUnique({ where: { id } });
    await prisma.documento.delete({ where: { id } }); // cascade borra los links
    // el binario también: ahora todo documento nuevo tiene uno y quedarían
    // huérfanos en documentos/ para siempre. Best-effort.
    if (doc?.archivoNombre) await fs.unlink(rutaAdjunto(id, doc.archivoNombre)).catch(() => {});
    const rag = await ragDeleteDocumento(id);
    return NextResponse.json({ ok: true, ...rag });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
