import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

// Lista las imágenes disponibles en /public/premios (SOLO filesystem, sin Prisma).
// Es la "paleta" que se arrastra en la vista de armado.
export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "premios");
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      files = []; // la carpeta puede no existir todavía
    }
    const exts = new Set([
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".svg",
      ".avif",
    ]);
    const premios = files
      .filter(
        (f) => !f.startsWith(".") && exts.has(path.extname(f).toLowerCase()),
      )
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
      .map((f) => ({
        file: f,
        url: `/premios/${encodeURIComponent(f)}`,
        nombre: f
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim(),
      }));
    return NextResponse.json({ ok: true, premios });
  } catch (e) {
    console.error("GET /api/sorteo/premios", e);
    return NextResponse.json({ ok: false, premios: [] }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
