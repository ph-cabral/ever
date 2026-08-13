import type { Metadata } from "next";
import { TareasBoard } from "@/components/tareas/TareasBoard";

export const metadata: Metadata = { title: "Compras · Tareas" };

// Duplicado (con tablas propias, ver lib/tareas/server.ts) del tablero de
// /sistema, exclusivo de Compras — no comparte datos con /rrhh/tareas ni con
// /sistema.
export default function ComprasTareaPage() {
  return (
    <TareasBoard
      apiBase="/api/compras/tarea"
      titulo="Compras · Tareas"
      accent={{ text: "text-amber-400", border: "border-amber-500", ring: "ring-amber-500/60" }}
    />
  );
}
