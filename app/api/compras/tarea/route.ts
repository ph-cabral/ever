import { GET_tablero, type TableroModels } from "@/lib/tareas/server";

const MODELS: TableroModels = { columna: "compras_tarea_columna", tarjeta: "compras_tarea_tarjeta", config: "compras_tarea_config" };

export async function GET() {
  return GET_tablero(MODELS);
}
