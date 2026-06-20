import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Fotos del SORTEO por DNI: lee de <raíz>/img_sorteo (override con SORTEO_IMG_DIR).
// Separado de /api/foto (que sirve /employees para legajo y el resto de la app).
const DIR = process.env.SORTEO_IMG_DIR || path.join(process.cwd(), "img_sorteo");
const EXTS = ["png", "jpg", "jpeg", "webp"] as const;
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dni: string }> }
) {
  const { dni } = await params;
  const safe = String(dni).replace(/\D/g, ""); // solo dígitos: evita path traversal
  if (!DIR || !safe) return new Response("Not found", { status: 404 });

  for (const ext of EXTS) {
    const fp = path.join(DIR, `${safe}.${ext}`);
    try {
      const buf = await fs.readFile(fp);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": MIME[ext],
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      // probar siguiente extensión
    }
  }
  return new Response("Not found", { status: 404 });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
