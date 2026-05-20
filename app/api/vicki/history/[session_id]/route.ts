import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VICKI_URL = process.env.VICKI_API_URL ?? "http://chat-agent:8000";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ session_id: string }> },
) {
  try {
    const { session_id } = await params;
    const r = await fetch(`${VICKI_URL}/history/${session_id}`, {
      signal: AbortSignal.timeout(10000),
    });
    const txt = await r.text();
    return new NextResponse(txt, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Error de conexión a Vicki" },
      { status: 502 },
    );
  }
}
