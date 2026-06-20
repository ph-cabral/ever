import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DIR = process.env.SORTEO_FOTOS_DIR || path.join(process.cwd(), "employees");
const EXTS = ["png", "webp", "jpg", "jpeg"] as const;
const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dni: string }> }
) {
  const { dni } = await params;
  const safe = String(dni).replace(/\D/g, "");
  if (!DIR || !safe) return new Response("Not found", { status: 404 });
  for (const ext of EXTS) {
    try {
      const buf = await fs.readFile(path.join(DIR, `${safe}.${ext}`));
      return new Response(new Uint8Array(buf), {
        headers: { "Content-Type": MIME[ext], "Cache-Control": "public, max-age=3600" },
      });
    } catch {}
  }
  return new Response("Not found", { status: 404 });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
