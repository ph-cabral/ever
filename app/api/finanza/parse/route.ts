import { NextRequest, NextResponse } from "next/server";
import { parseFinanzaWorkbook } from "@/lib/finanza/parseFinanza";

export const runtime = "nodejs"; // xlsx requiere Node
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const data = parseFinanzaWorkbook(buf, file.name);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al parsear" }, { status: 500 });
  }
}
