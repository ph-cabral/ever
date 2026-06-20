import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

export const MAX_ALBUM = 10;

type Db = PrismaClient | Prisma.TransactionClient;

// Ronda activa = la última no cerrada. Si create=true y no hay, crea una vacía.
export async function getRondaActiva(db: Db = prisma, create = false) {
  let ronda = await db.sorteo_ronda.findFirst({
    where: { estado: { not: "cerrado" } },
    orderBy: { id: "desc" },
  });
  if (!ronda && create) {
    ronda = await db.sorteo_ronda.create({ data: {} });
  }
  return ronda;
}

// Enriquece el álbum con el sector del legajo (match por dni numérico).
export async function conSector<T extends { dni: string }>(db: Db, album: T[]) {
  const norm = (s: unknown) => String(s ?? "").replace(/\D/g, "");
  const dnis = album.map((a) => norm(a.dni));
  const l = dnis.length
    ? await db.legajo.findMany({
        where: { dni: { in: dnis } },
        select: { dni: true, sector: true },
      })
    : [];
  const m = new Map(l.map((x) => [norm(x.dni), x.sector]));
  return album.map((a) => ({ ...a, sector: m.get(norm(a.dni)) ?? null }));
}

// Clave para modo real / vaciar / nuevo sorteo.
export function claveOk(clave: string) {
  const esperado =
    process.env.SORTEO_ALBUM_CLAVE || process.env.SORTEO_CLAVE || "";
  return Boolean(esperado) && clave === esperado;
}
