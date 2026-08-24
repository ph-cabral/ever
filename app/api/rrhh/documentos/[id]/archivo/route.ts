// Adjunto original del documento (PDF/Word/etc.). Se guarda en documentos/
// (fuera de git, mismo patrón que employees/); el texto indexable sigue siendo
// `contenido` — el adjunto es solo para descargar el original.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DIR = process.env.DOCUMENTOS_DIR || path.join(process.cwd(), "documentos");
const MAX_BYTES = 20_000_000;

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

type Params = { params: Promise<{ id: string }> };

function safeName(name: string) {
  // sin rutas ni caracteres raros → evita path traversal
  return path.basename(name).replace(/[^a-zA-Z0-9._ ()-]/g, "_").slice(0, 150);
}

export async function POST(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const doc = await prisma.documento.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "no existe" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Máximo 20MB" }, { status: 400 });

  const nombre = safeName(file.name || `documento-${id}`);

  try {
    await fs.mkdir(DIR, { recursive: true });

    // borrar adjunto anterior si tenía otro nombre
    if (doc.archivoNombre && doc.archivoNombre !== nombre) {
      await fs.unlink(path.join(DIR, `${id}_${doc.archivoNombre}`)).catch(() => {});
    }

    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(DIR, `${id}_${nombre}`), buf);
  } catch (e: unknown) {
    // ej. EACCES si DOCUMENTOS_DIR no está montado como volumen escribible
    // (ver docker-compose.prod.yml) — que el error real llegue al frontend
    // en vez de un 500 genérico.
    return NextResponse.json(
      { error: `No se pudo guardar el archivo en el servidor: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  await prisma.documento.update({ where: { id }, data: { archivoNombre: nombre } });
  return NextResponse.json({ ok: true, archivoNombre: nombre });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const doc = await prisma.documento.findUnique({ where: { id } });
  if (!doc?.archivoNombre) return new NextResponse(null, { status: 404 });
  try {
    const buf = await fs.readFile(path.join(DIR, `${id}_${doc.archivoNombre}`));
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
    await fs.unlink(path.join(DIR, `${id}_${doc.archivoNombre}`)).catch(() => {});
    await prisma.documento.update({ where: { id }, data: { archivoNombre: null } });
  }
  return NextResponse.json({ ok: true });
}
