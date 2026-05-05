import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    parseInt(searchParams.get("pageSize") ?? "20", 10),
  );
  const search = (searchParams.get("search") ?? "").trim();

  const where = search
    ? {
        OR: [
          { nombre: { contains: search, mode: "insensitive" as const } },
          { apellido: { contains: search, mode: "insensitive" as const } },
          { sector: { contains: search, mode: "insensitive" as const } },
          { codigo: { contains: search, mode: "insensitive" as const } },
          { dni: { contains: search } },
        ],
      }
    : {};

  const [total, items] = await Promise.all([
    prisma.legajo.count({ where }),
    prisma.legajo.findMany({
      where,
      select: {
        codigo: true,
        nombre: true,
        apellido: true,
        sector: true,
        estado: true,
      },
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}
