import { redirect } from "next/navigation";

// ──────────────────────────────────────────────────────────────────────────────
// MOVIDO → /compras/faltantes
//   Esta vista ("faltantes a encargar", sin existencia) pasó al sector compras.
//   Se deja este redirect para no romper enlaces viejos (incluidos los de los
//   otros 2 proyectos vinculados). La lógica vive ahora en
//   app/compras/faltantes/page.tsx. Cuando ya no haga falta el redirect se puede
//   borrar la carpeta app/deposito/faltantes/encargar/ con: git rm -r ...
// ──────────────────────────────────────────────────────────────────────────────

export default function EncargarFaltantesMoved() {
  redirect("/compras/faltantes");
}
