import { NextRequest } from "next/server";
import { PATCH_tarjeta, DELETE_tarjeta, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "rrhh_tarea_columna", tarjeta: "rrhh_tarea_tarjeta", config: "rrhh_tarea_config" };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return PATCH_tarjeta(MODELS, req, Number(id));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return DELETE_tarjeta(MODELS, Number(id));
}
