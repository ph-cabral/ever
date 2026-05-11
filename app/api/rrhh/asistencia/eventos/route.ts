import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API = process.env.HIKVISION_API_URL ?? "http://hikvision-api:8000";
const TOKEN = process.env.HIKVISION_API_TOKEN ?? "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = new URLSearchParams();
  for (const k of ["desde", "hasta", "employee_no"]) {
    const v = searchParams.get(k);
    if (v) qs.set(k, v);
  }
  const r = await fetch(`${API}/eventos?${qs}`, {
    headers: TOKEN ? { "x-token": TOKEN } : {},
    cache: "no-store",
  });
  if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
  return NextResponse.json(await r.json());
}
