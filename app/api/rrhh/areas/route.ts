import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const areas = await prisma.area.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      sectores: { orderBy: { nombre: "asc" }, select: { id: true, nombre: true } },
    },
  });
  return NextResponse.json(areas);
}
