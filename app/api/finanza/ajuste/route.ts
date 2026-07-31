import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ajuste manual de facturación (ver ever/sql/finanza_ajuste_manual.sql y
// indicadores-api/finanza.py). Ventas reales que no generaron comprobante en
// Magnus (caso Todo Goma, CodCliente 5226, presupuesto Ctrl. A 0002-00041879
// del 30/07/2026 sin ninguna fila en Ven_CompCabecera / VenFer_PedidoCabecera
// / Pre_PresupCab). El GET (listar) sigue protegido por el módulo "finanza"
// (middleware.ts); el POST (alta) además requiere ADMIN, mismo criterio que
// /api/rrhh/asistencia/ajuste — es plata real sumándose al total del widget.
export async function GET(req: NextRequest) {
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");
  const qs = new URLSearchParams();
  if (desde) qs.set("desde", desde);
  if (hasta) qs.set("hasta", hasta);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  try {
    const res = await fetch(`${API_URL}/finanza/ajuste${suffix}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error al listar ajustes", detail },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("GET /api/finanza/ajuste", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de facturación" },
      { status: 503 },
    );
  }
}

type Body = {
  fecha?: string;
  neto?: number;
  iva?: number | null;
  total?: number | null;
  codCliente?: number | null;
  clienteNombre?: string | null;
  comprobante?: string | null;
  motivo?: string | null;
};

export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body: Body = await req.json();
  if (!body.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
    return NextResponse.json(
      { error: "fecha debe tener formato YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (typeof body.neto !== "number") {
    return NextResponse.json({ error: "neto es obligatorio" }, { status: 400 });
  }

  const session = await getSession();
  try {
    const res = await fetch(`${API_URL}/finanza/ajuste`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, usuario: session?.nombre ?? null }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Error al cargar el ajuste", detail: data },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("POST /api/finanza/ajuste", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de facturación" },
      { status: 503 },
    );
  }
}
