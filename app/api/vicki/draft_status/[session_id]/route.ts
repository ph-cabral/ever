import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const VICKI_URL = process.env.VICKI_API_URL ?? "http://chat-agent:8000";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ session_id: string }> },
) {
  const { session_id } = await params;
  try {
    const r = await fetch(`${VICKI_URL}/draft_status/${session_id}`, {
      cache: "no-store",
    });
    return new NextResponse(await r.text(), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 502 });
  }
}
