import { NextRequest } from "next/server";
import { POST_tarjeta, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "calidad_tarea_columna", tarjeta: "calidad_tarea_tarjeta", config: "calidad_tarea_config" };

export async function POST(req: NextRequest) {
  return POST_tarjeta(MODELS, req);
}
