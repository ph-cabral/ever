import { NextRequest } from "next/server";
import { POST_columna, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "rrhh_tarea_columna", tarjeta: "rrhh_tarea_tarjeta", config: "rrhh_tarea_config" };

export async function POST(req: NextRequest) {
  return POST_columna(MODELS, req);
}
