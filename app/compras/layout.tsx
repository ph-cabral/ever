// La sidebar de /compras pasó a ser GLOBAL (pedido de Pablo 2026-08-27): vive
// en components/nav/SidebarGlobal.tsx, montada en app/layout.tsx, y ya muestra
// las vistas del módulo en el que estás parado a partir del catálogo de
// lib/auth/modules.ts. Este layout queda como pasamanos para no romper la ruta
// ni el árbol de app/.
export default function ComprasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
