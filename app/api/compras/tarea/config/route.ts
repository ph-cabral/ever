import { NextRequest } from "next/server";
import { GET_config, PATCH_config, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "compras_tarea_columna", tarjeta: "compras_tarea_tarjeta", config: "compras_tarea_config" };

export async function GET() {
  return GET_config(MODELS);
}

export async function PATCH(req: NextRequest) {
  return PATCH_config(MODELS, req);
}
