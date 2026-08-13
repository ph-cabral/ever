import { NextRequest } from "next/server";
import { PATCH_tarjetas_reorder, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "compras_tarea_columna", tarjeta: "compras_tarea_tarjeta", config: "compras_tarea_config" };

export async function PATCH(req: NextRequest) {
  return PATCH_tarjetas_reorder(MODELS, req);
}
