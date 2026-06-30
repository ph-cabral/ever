import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import {
  MODULES,
  defaultModulosForSector,
  isModuleKey,
  isViewHref,
  viewsForModule,
  type ModuleKey,
} from "@/lib/auth/modules";

export const dynamic = "force-dynamic";

function sanitizeMods(v: unknown): ModuleKey[] {
  return Array.isArray(v) ? v.filter(isModuleKey) : [];
}
function sanitizeHrefs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(isViewHref) : [];
}
function sanitizeOcultos(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => isModuleKey(x) || isViewHref(x))
    : [];
}
function allViewsForMods(mods: ModuleKey[]): string[] {
  return mods.flatMap((m) => viewsForModule(m).map((v) => v.href));
}

// Lista todos los sectores conocidos con sus permisos (guardados o sugeridos).
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const [permisos, sectores, legajoSectores] = await Promise.all([
    prisma.sector_permiso.findMany(),
    prisma.sector.findMany({ select: { nombre: true } }),
    prisma.legajo.findMany({
      where: { sector: { not: null } },
      select: { sector: true },
      distinct: ["sector"],
    }),
  ]);

  const names = new Set<string>();
  sectores.forEach((s) => names.add(s.nombre));
  legajoSectores.forEach((l) => l.sector && names.add(l.sector));
  permisos.forEach((p) => names.add(p.sector));

  const byName = new Map(permisos.map((p) => [p.sector, p]));
  const items = [...names]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((sector) => {
      const row = byName.get(sector);
      if (!row) {
        const modulos = defaultModulosForSector(sector);
        return { sector, modulos, vistas: allViewsForMods(modulos), ocultos: [], guardado: false };
      }
      const modulos = sanitizeMods(row.modulos);
      const stored = sanitizeHrefs((row as any).vistas);
      return {
        sector,
        modulos,
        // vistas vacías ⇒ todas las de los módulos habilitados (compat filas viejas)
        vistas: stored.length ? stored : allViewsForMods(modulos),
        ocultos: sanitizeOcultos((row as any).ocultos),
        guardado: true,
      };
    });

  return NextResponse.json({
    items,
    // Catálogo completo: módulos + sus vistas, para construir el árbol en el cliente.
    modulosDisponibles: MODULES.map((m) => ({
      key: m.key,
      label: m.label,
      vistas: (m.children ?? []).map((c) => ({ label: c.label, href: c.href })),
    })),
  });
}

// Guarda (upsert) los permisos de uno o varios sectores.
export async function PUT(req: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items) return NextResponse.json({ error: "Falta items[]" }, { status: 400 });

  for (const it of items) {
    const sector = String(it?.sector ?? "").trim();
    if (!sector) continue;
    const modulos = sanitizeMods(it?.modulos);
    // Sólo se guardan vistas de módulos habilitados.
    const vistas = sanitizeHrefs(it?.vistas).filter((href) =>
      modulos.some((m) => viewsForModule(m).some((v) => v.href === href)),
    );
    const ocultos = sanitizeOcultos(it?.ocultos);
    await prisma.sector_permiso.upsert({
      where: { sector },
      create: { sector, modulos, vistas, ocultos } as any,
      update: { modulos, vistas, ocultos } as any,
    });
  }

  return NextResponse.json({ ok: true });
}
