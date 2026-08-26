// "Mis accesos" — accesos directos que cada usuario marca con la estrella en la
// sidebar de /compras (pedido de Pablo 2026-08-26).
//
// GET    -> { accesos, catalogo }  accesos = lo marcado por el usuario logueado
//                                  catalogo = todo lo que PUEDE marcar, ya
//                                  filtrado por sus permisos de sesión.
// POST   { href }                  marca (idempotente; el label sale del catálogo)
// DELETE ?href=...                 desmarca
//
// Es preferencia personal, NO permiso: sólo se puede marcar algo que ya está en
// el catálogo permitido, así que marcar nunca abre una puerta.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { MODULES, type NavNode, type SessionPayload } from "@/lib/auth/modules";

export const dynamic = "force-dynamic";

export interface AccesoItem {
  href: string;
  label: string;
  grupo: string; // módulo al que pertenece (para agrupar en el selector)
}

/** Todo lo que este usuario tiene permitido ver, aplanado a { href, label, grupo }. */
function catalogoParaSesion(s: SessionPayload): AccesoItem[] {
  const isAdmin = s.rol === "ADMIN";
  const vistas = s.vistas; // cookies viejas: undefined => todas
  const ocultos = new Set(s.ocultos ?? []);
  const out: AccesoItem[] = [];

  const walk = (grupo: string, nodes: NavNode[] | undefined) => {
    for (const n of nodes ?? []) {
      const permitida = isAdmin || !Array.isArray(vistas) || vistas.includes(n.href);
      if (permitida && !ocultos.has(n.href)) out.push({ href: n.href, label: n.label, grupo });
      walk(grupo, n.children);
    }
  };

  for (const m of MODULES) {
    if (!(isAdmin || s.mods.includes(m.key)) || ocultos.has(m.key)) continue;
    if (m.hasIndex) out.push({ href: m.href, label: m.label, grupo: m.label });
    walk(m.label, m.children);
  }
  return out;
}

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const catalogo = catalogoParaSesion(s);
  let accesos: { href: string; label: string }[] = [];
  try {
    const filas = await prisma.usuario_acceso.findMany({
      where: { usuarioId: s.uid },
      orderBy: [{ orden: "asc" }, { id: "asc" }],
    });
    // El label se re-resuelve contra el catálogo por si cambió el nombre de la
    // vista; si ya no está en el catálogo se muestra el guardado (se puede
    // desmarcar, pero el link puede no llevar a ningún lado).
    accesos = filas.map((f) => ({
      href: f.href,
      label: catalogo.find((c) => c.href === f.href)?.label ?? f.label,
    }));
  } catch {
    // Tabla nueva: si todavía no se corrió sql/usuario_acceso.sql (o falta
    // `prisma generate`), la sidebar sigue andando sin accesos.
    return NextResponse.json({ accesos: [], catalogo, warn: "sin-tabla" });
  }
  return NextResponse.json({ accesos, catalogo });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { href?: string } | null;
  const href = body?.href?.trim();
  if (!href) return NextResponse.json({ error: "Falta href" }, { status: 400 });

  const item = catalogoParaSesion(s).find((c) => c.href === href);
  if (!item) return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });

  const max = await prisma.usuario_acceso.aggregate({
    where: { usuarioId: s.uid },
    _max: { orden: true },
  });
  await prisma.usuario_acceso.upsert({
    where: { usuarioId_href: { usuarioId: s.uid, href } },
    update: { label: item.label },
    create: {
      usuarioId: s.uid,
      href,
      label: item.label,
      orden: (max._max.orden ?? -1) + 1,
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const href = req.nextUrl.searchParams.get("href");
  if (!href) return NextResponse.json({ error: "Falta href" }, { status: 400 });

  await prisma.usuario_acceso.deleteMany({ where: { usuarioId: s.uid, href } });
  return NextResponse.json({ ok: true });
}
