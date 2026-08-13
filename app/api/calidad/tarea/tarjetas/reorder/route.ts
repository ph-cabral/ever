import { NextRequest } from "next/server";
import { PATCH_tarjetas_reorder, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "calidad_tarea_columna", tarjeta: "calidad_tarea_tarjeta", config: "calidad_tarea_config" };

export async function PATCH(req: NextRequest) {
  return PATCH_tarjetas_reorder(MODELS, req);
}
