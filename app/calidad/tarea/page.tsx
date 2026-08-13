import type { Metadata } from "next";
import { TareasBoard } from "@/components/tareas/TareasBoard";

export const metadata: Metadata = { title: "Calidad · Tareas" };

// Duplicado (con tablas propias, ver lib/tareas/server.ts) del tablero de
// /sistema, exclusivo de Calidad — no comparte datos con /rrhh/tareas ni con
// /sistema. Es también la única vista del módulo "Calidad" (no tiene
// app/calidad/page.tsx propio, ver lib/auth/modules.ts).
export default function CalidadTareaPage() {
  return (
    <TareasBoard
      apiBase="/api/calidad/tarea"
      titulo="Calidad · Tareas"
      accent={{ text: "text-fuchsia-400", border: "border-fuchsia-500", ring: "ring-fuchsia-500/60" }}
    />
  );
}
