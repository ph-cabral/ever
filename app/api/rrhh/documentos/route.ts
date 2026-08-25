// CRUD de documentos por puesto (procedimientos, instructivos y descripciones
// de puesto). Al crear se indexa en Qdrant vía vicki_chat (best-effort:
// ragOk=false si vicki_chat no respondió).
//
// POST acepta DOS formas:
//  - multipart/form-data (la de la UI): file + tipo + puestoIds. El título sale
//    del nombre del archivo sin extensión y el `contenido` indexable se extrae
//    del archivo (lib/rrhh/extraerTexto.ts). Un solo request: crea la fila,
//    guarda el adjunto e indexa.
//  - application/json (legacy/API): titulo + contenido + tipo + puestoIds.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ragSyncDocumento } from "@/lib/rrhh/vickiRag";
import { TIPOS, chequearUnicaDescripcion } from "@/lib/rrhh/documentosTipos";
import { extraerTexto, SinTextoError } from "@/lib/rrhh/extraerTexto";
import { MAX_BYTES, guardarArchivo, tituloDesdeArchivo } from "@/lib/rrhh/documentosArchivo";

export const dynamic = "force-dynamic";

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
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("multipart/form-data") ? crearDesdeArchivo(req) : crearDesdeJson(req);
}

// ── carga por archivo (la de /rrhh/puestos) ──
async function crearDesdeArchivo(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Máximo 20MB" }, { status: 400 });

  const tipo = String(form.get("tipo") ?? "procedimiento");
  if (!TIPOS.has(tipo)) return NextResponse.json({ error: "tipo inválido" }, { status: 400 });

  const titulo = tituloDesdeArchivo(file.name);
  if (!titulo) return NextResponse.json({ error: "El archivo no tiene nombre usable como título" }, { status: 400 });

  let puestoIds: number[] = [];
  try {
    const crudo = JSON.parse(String(form.get("puestoIds") ?? "[]"));
    puestoIds = Array.isArray(crudo) ? crudo.map(Number).filter(Number.isInteger) : [];
  } catch { /* queda vacío */ }
  if (!puestoIds.length) return NextResponse.json({ error: "Elegí el puesto antes de subir" }, { status: 400 });

  const choque = await chequearUnicaDescripcion(tipo, puestoIds);
  if (choque) return NextResponse.json({ error: choque }, { status: 409 });

  // El texto se extrae ANTES de tocar la base: si el archivo no tiene texto
  // legible el documento no le sirve a Vicki y no vale la pena crearlo.
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
      { error: "El archivo no tiene texto extraíble (¿es un PDF escaneado / solo imágenes?). Vicki no podría leerlo." },
      { status: 400 },
    );
  }

  try {
    const doc = await prisma.documento.create({
      data: { tipo, titulo, contenido, puestos: { create: puestoIds.map((puestoId) => ({ puestoId })) } },
    });

    // El adjunto es secundario: si falla el disco, el documento igual queda
    // cargado e indexado y el frontend avisa (archivoError).
    let archivoError: string | undefined;
    try {
      const nombre = await guardarArchivo(doc.id, file);
      await prisma.documento.update({ where: { id: doc.id }, data: { archivoNombre: nombre } });
    } catch (e: unknown) {
      archivoError = `guardado, pero no se pudo archivar el original: ${e instanceof Error ? e.message : String(e)}`;
    }

    const rag = await ragSyncDocumento(doc.id);
    return NextResponse.json({ ...doc, ...rag, ...(archivoError ? { archivoError } : {}) }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// ── carga por JSON (sin archivo) ──
async function crearDesdeJson(req: NextRequest) {
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

  // una sola descripción de puesto por puesto
  const choque = await chequearUnicaDescripcion(tipo, puestoIds);
  if (choque) return NextResponse.json({ error: choque }, { status: 409 });

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
