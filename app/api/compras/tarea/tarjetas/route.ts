import { NextRequest } from "next/server";
import { POST_tarjeta, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "compras_tarea_columna", tarjeta: "compras_tarea_tarjeta", config: "compras_tarea_config" };

export async function POST(req: NextRequest) {
  return POST_tarjeta(MODELS, req);
}
