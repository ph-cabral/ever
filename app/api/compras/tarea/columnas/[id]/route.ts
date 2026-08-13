import { NextRequest } from "next/server";
import { PATCH_columna, DELETE_columna, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "compras_tarea_columna", tarjeta: "compras_tarea_tarjeta", config: "compras_tarea_config" };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return PATCH_columna(MODELS, req, Number(id));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return DELETE_columna(MODELS, Number(id));
}
