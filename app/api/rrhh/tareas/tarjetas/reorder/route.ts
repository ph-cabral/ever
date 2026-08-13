import { NextRequest } from "next/server";
import { PATCH_tarjetas_reorder, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "rrhh_tarea_columna", tarjeta: "rrhh_tarea_tarjeta", config: "rrhh_tarea_config" };

export async function PATCH(req: NextRequest) {
  return PATCH_tarjetas_reorder(MODELS, req);
}
