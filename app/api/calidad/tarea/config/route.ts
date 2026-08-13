import { NextRequest } from "next/server";
import { GET_config, PATCH_config, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "calidad_tarea_columna", tarjeta: "calidad_tarea_tarjeta", config: "calidad_tarea_config" };

export async function GET() {
  return GET_config(MODELS);
}

export async function PATCH(req: NextRequest) {
  return PATCH_config(MODELS, req);
}
