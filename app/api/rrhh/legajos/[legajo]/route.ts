// app/api/rrhh/legajos/[legajo]/route.ts  (REEMPLAZA al GET-por-codigo anterior)
// El segmento [legajo] ahora es el id numérico del legajo (unifica con la página y la lista).
import { NextRequest, NextResponse } from "next/server";
import { getLegajoFormValues, updateLegajo } from "@/lib/rrhh/legajoService";
import { legajoUpdateSchema } from "@/lib/rrhh/legajoSchema";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ legajo: string }> }) {
  const id = Number((await params).legajo);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const values = await getLegajoFormValues(id);
  if (!values) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(values);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ legajo: string }> }) {
  const id = Number((await params).legajo);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = legajoUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación", detalles: parsed.error.flatten() }, { status: 422 });
  }

  try {
    await updateLegajo(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: `Valor duplicado: ${e?.meta?.target}` }, { status: 409 });
    }
    console.error("PUT legajo", e);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
