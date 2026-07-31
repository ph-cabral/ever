import { redirect } from "next/navigation";

// Migrado a /deposito/deposito (2026-07-31): la vista WMS ahora vive como
// componente (ver ../components/wmsTab.tsx) dentro del panel con sidebar
// wms/mesas. Esta ruta queda solo como redirect para links viejos; se sacó
// del menú vía IGNORE en scripts/gen-nav.mjs.
export default function DepositoWmsRedirect() {
  redirect("/deposito/deposito");
}
