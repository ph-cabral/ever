// Archivo original del documento.
//
// POST = reemplazar el archivo de un documento ya existente. Desde que la carga
// es "subir el archivo" (no hay más editor de texto), reemplazar el archivo es
// la ÚNICA forma de actualizar el contenido: por eso acá se re-extrae el texto,
// se sube la versión y se re-indexa en Vicki. Guardar solo el binario dejaría
// el índice mostrando el contenido viejo.
// GET = descargar el original. DELETE = sacar el adjunto (el texto queda).
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ragSyncDocumento } from "@/lib/rrhh/vickiRag";
import { extraerTexto, SinTextoError } from "@/lib/rrhh/extraerTexto";
import { MAX_BYTES, MIME, guardarArchivo, rutaAdjunto, tituloDesdeArchivo } from "@/lib/rrhh/documentosArchivo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const doc = await prisma.documento.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "no existe" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Máximo 20MB" }, { status: 400 });

  let contenido: string;
  try {
    contenido = await extraerTexto(file);
  } catch (e: unknown) {
    const msg = e instanceof SinTextoError
      ? e.message
      : `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (!contenido.trim()) {
    return NextResponse.json(
      { error: "El archivo no tiene texto extraíble (¿es un PDF escaneado?). Vicki no podría leerlo." },
      { status: 400 },
    );
  }

  let nombre: string;
  try {
    nombre = await guardarArchivo(id, file, doc.archivoNombre);
  } catch (e: unknown) {
    // ej. EACCES si DOCUMENTOS_DIR no está montado como volumen escribible
    // (ver docker-compose.prod.yml) — que el error real llegue al frontend.
    return NextResponse.json(
      { error: `No se pudo guardar el archivo en el servidor: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const titulo = tituloDesdeArchivo(file.name) || doc.titulo;
  await prisma.documento.update({
    where: { id },
    data: {
      archivoNombre: nombre,
      titulo,
      contenido,
      ...(contenido !== doc.contenido ? { version: doc.version + 1 } : {}),
    },
  });
  const rag = await ragSyncDocumento(id);
  return NextResponse.json({ ok: true, archivoNombre: nombre, titulo, ...rag });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const doc = await prisma.documento.findUnique({ where: { id } });
  if (!doc?.archivoNombre) return new NextResponse(null, { status: 404 });
  try {
    const buf = await fs.readFile(rutaAdjunto(id, doc.archivoNombre));
    const ext = path.extname(doc.archivoNombre).toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${doc.archivoNombre}"`,
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const doc = await prisma.documento.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "no existe" }, { status: 404 });
  if (doc.archivoNombre) {
    await fs.unlink(rutaAdjunto(id, doc.archivoNombre)).catch(() => {});
    await prisma.documento.update({ where: { id }, data: { archivoNombre: null } });
  }
  return NextResponse.json({ ok: true });
}
