import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import {
  MODULES,
  defaultModulosForSector,
  isModuleKey,
  type ModuleKey,
} from "@/lib/auth/modules";

export const dynamic = "force-dynamic";

function sanitize(v: unknown): ModuleKey[] {
  return Array.isArray(v) ? v.filter(isModuleKey) : [];
}

// Lista todos los sectores conocidos con sus módulos (guardados o sugeridos).
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
      return {
        sector,
        modulos: row ? sanitize(row.modulos) : defaultModulosForSector(sector),
        guardado: !!row,
      };
    });

  return NextResponse.json({
    items,
    modulosDisponibles: MODULES.map((m) => ({ key: m.key, label: m.label })),
  });
}

// Guarda (upsert) los módulos de uno o varios sectores.
export async function PUT(req: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items) return NextResponse.json({ error: "Falta items[]" }, { status: 400 });

  for (const it of items) {
    const sector = String(it?.sector ?? "").trim();
    if (!sector) continue;
    const modulos = sanitize(it?.modulos);
    await prisma.sector_permiso.upsert({
      where: { sector },
      create: { sector, modulos },
      update: { modulos },
    });
  }

  return NextResponse.json({ ok: true });
}
