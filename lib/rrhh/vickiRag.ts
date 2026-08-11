// Sync de procedimientos/instructivos hacia vicki_chat (Qdrant).
// Best-effort: si vicki_chat está caído, el CRUD en Postgres igual se completa
// y la respuesta avisa con ragOk=false (se puede reintentar guardando de nuevo).
import { prisma } from "@/lib/prisma";

const VICKI_URL = process.env.VICKI_API_URL ?? "http://chat-agent:8000";

export type RagResult = { ragOk: boolean; ragError?: string };

// Re-indexa un documento en Qdrant leyendo su estado actual (contenido + puestos).
export async function ragSyncDocumento(documentoId: number): Promise<RagResult> {
  const doc = await prisma.documento.findUnique({
    where: { id: documentoId },
    include: { puestos: { include: { puesto: { select: { nombre: true } } } } },
  });
  if (!doc) return { ragOk: false, ragError: "documento inexistente" };
  try {
    const r = await fetch(`${VICKI_URL}/rag/documento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: doc.id,
        tipo: doc.tipo,
        titulo: doc.titulo,
        contenido: doc.contenido,
        version: doc.version,
        vigente: doc.vigente,
        puestos: doc.puestos.map((p) => p.puesto.nombre),
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return { ragOk: false, ragError: `vicki_chat ${r.status}: ${await r.text()}` };
    return { ragOk: true };
  } catch (e: unknown) {
    return { ragOk: false, ragError: e instanceof Error ? e.message : String(e) };
  }
}

export async function ragDeleteDocumento(documentoId: number): Promise<RagResult> {
  try {
    const r = await fetch(`${VICKI_URL}/rag/documento/${documentoId}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ragOk: false, ragError: `vicki_chat ${r.status}: ${await r.text()}` };
    return { ragOk: true };
  } catch (e: unknown) {
    return { ragOk: false, ragError: e instanceof Error ? e.message : String(e) };
  }
}

// Re-indexa varios documentos (ej. cuando cambian las asignaciones de un puesto:
// el payload en Qdrant incluye los nombres de puestos, hay que refrescarlo).
export async function ragSyncDocumentos(ids: number[]): Promise<RagResult> {
  let ragOk = true;
  let ragError: string | undefined;
  for (const id of ids) {
    const r = await ragSyncDocumento(id);
    if (!r.ragOk) {
      ragOk = false;
      ragError = r.ragError;
    }
  }
  return { ragOk, ragError };
}
