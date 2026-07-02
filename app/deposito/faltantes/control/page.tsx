import { redirect } from "next/navigation";

// ──────────────────────────────────────────────────────────────────────────────
// MOVIDO → /compras/faltantes
//   La carga de "fecha de arribo" pasó a /compras/faltantes (columna Arribo,
//   fan-out por artículo+día vía /api/compras/faltantes-arribo). "¿Cliente lo
//   quiere?" sigue viviendo en /ventas/faltantes (sin cambios). Se deja este
//   redirect para no romper enlaces viejos. La lógica de fechaArribo vive
//   ahora en app/compras/faltantes/page.tsx. Cuando ya no haga falta se puede
//   borrar la carpeta app/deposito/faltantes/control/ con: git rm -r ...
// ──────────────────────────────────────────────────────────────────────────────

export default function ControlFaltantesMoved() {
  redirect("/compras/faltantes");
}
