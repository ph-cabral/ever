// Tipos de documento de /rrhh/puestos y la regla de "una descripción por puesto".
//
// `descripcion_puesto` NO es un procedimiento: es el perfil del puesto (misión,
// responsabilidades, requisitos, competencias) y Vicki lo usa cuando se busca a
// ALGUIEN para ese puesto — no cuando preguntan cómo se hace una tarea.
// Ver vicki_chat/app/nodes.py::rag_search_node.
import { prisma } from "@/lib/prisma";

export const TIPOS = new Set(["procedimiento", "instructivo", "descripcion_puesto"]);

export const TIPO_DESCRIPCION = "descripcion_puesto";

/**
 * Un puesto puede tener N procedimientos/instructivos, pero UNA sola
 * descripción de puesto. Se valida acá (a nivel API) en vez de con un índice
 * único en Postgres para no requerir migración; si en algún momento se agrega
 * el índice parcial, esta función sigue sirviendo para dar el error lindo.
 *
 * Devuelve un mensaje de error si la asignación rompe la regla, o null si está ok.
 */
export async function chequearUnicaDescripcion(
  tipo: string,
  puestoIds: number[],
  excluirDocumentoId?: number,
): Promise<string | null> {
  if (tipo !== TIPO_DESCRIPCION || !puestoIds.length) return null;

  const choques = await prisma.puesto_documento.findMany({
    where: {
      puestoId: { in: puestoIds },
      documento: {
        tipo: TIPO_DESCRIPCION,
        ...(excluirDocumentoId ? { id: { not: excluirDocumentoId } } : {}),
      },
    },
    select: {
      puesto: { select: { nombre: true } },
      documento: { select: { titulo: true } },
    },
  });
  if (!choques.length) return null;

  const detalle = choques
    .map((c) => `${c.puesto.nombre} (ya tiene «${c.documento.titulo}»)`)
    .join(", ");
  return `Estos puestos ya tienen una descripción de puesto: ${detalle}. Editá la existente o sacale la asignación primero.`;
}

/**
 * Al revés: cuando se asignan documentos DESDE el puesto (PATCH /puestos/[id]),
 * verifica que no entren dos descripciones de puesto al mismo puesto.
 */
export async function chequearUnicaDescripcionEnPuesto(
  puestoId: number,
  documentoIds: number[],
): Promise<string | null> {
  if (!documentoIds.length) return null;
  const descs = await prisma.documento.findMany({
    where: { id: { in: documentoIds }, tipo: TIPO_DESCRIPCION },
    select: { id: true, titulo: true },
  });
  if (descs.length <= 1) return null;
  return `Un puesto puede tener una sola descripción de puesto; estás asignando ${descs.length}: ${descs
    .map((d) => `«${d.titulo}»`)
    .join(", ")}.`;
}
