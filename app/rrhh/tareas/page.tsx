import type { Metadata } from "next";
import { TareasBoard } from "@/components/tareas/TareasBoard";

export const metadata: Metadata = { title: "RRHH · Tareas" };

// Duplicado (con tablas propias, ver lib/tareas/server.ts) del tablero de
// /sistema, exclusivo de RRHH — no comparte datos con /calidad/tarea ni con
// /sistema.
export default function RrhhTareasPage() {
  return (
    <TareasBoard
      apiBase="/api/rrhh/tareas"
      titulo="RRHH · Tareas"
      accent={{ text: "text-indigo-400", border: "border-indigo-500", ring: "ring-indigo-500/60" }}
    />
  );
}
