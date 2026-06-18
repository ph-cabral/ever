// app/api/rrhh/legajos/foto/[dni]/route.ts
// Sirve la foto del empleado desde la carpeta employees/ (fuera de public/).
// Match por DNI; prueba extensiones jpg / jpeg / png en ese orden.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const EXTS = [
  { ext: "jpg", type: "image/jpeg" },
  { ext: "jpeg", type: "image/jpeg" },
  { ext: "png", type: "image/png" },
];

// Carpeta employees/ en la raíz del repo. Override con EMPLOYEES_DIR si en prod está montada en otro path.
const DIR = process.env.EMPLOYEES_DIR || path.join(process.cwd(), "employees");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ dni: string }> }) {
  const raw = (await params).dni ?? "";
  const dni = raw.replace(/\D/g, ""); // solo dígitos -> evita path traversal
  if (!dni) return new NextResponse(null, { status: 404 });

  for (const { ext, type } of EXTS) {
    try {
      const buf = await fs.readFile(path.join(DIR, `${dni}.${ext}`));
      return new NextResponse(new Uint8Array(buf), {
        headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
      });
    } catch {
      // probar siguiente extensión
    }
  }
  return new NextResponse(null, { status: 404 });
}
