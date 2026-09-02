// Presupuestos APROBADOS por área de compras — pestaña "Presupuestos" de
// /finanza (2026-09-01).
//
// Lo EJECUTADO son las OC de Magnus (../route.ts → indicadores-api
// /compras/oc-por-area). Esto es el otro lado: cuánto se aprobó para cada área
// y por qué período, que se carga a mano acá porque Magnus no lo tiene.
//
//   GET    ?desde=YYYY-MM&hasta=YYYY-MM
//          -> { desde, hasta, presupuestos: [...] } con `montoPeriodo`
//             ya PRORRATEADO a los meses del filtro (ver `prorratear`).
//             OJO: el prorrateo es DATO INFORMATIVO — la barra de la pantalla
//             se mide contra `monto` (el presupuesto completo), no contra
//             `montoPeriodo`. Sin rango devuelve todos (para el modal).
//   POST   { codigoArea, area, mesDesde, mesHasta, montoMillones, nota? }
//          -> upsert por (área + período). El monto entra en MILLONES y se
//             guarda en PESOS: la pantalla no tiene que escribir los ceros.
//   DELETE ?id=123
//
// Escrituras: sólo ADMIN (requireAdmin). La lectura la protege el módulo
// "finanza" en el middleware, igual que el resto de /api/finanza/*.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const MILLON = 1_000_000;
// Un presupuesto no puede abarcar más que la ventana que sabe leer la vista.
const MAX_MESES = 36;

/** 'YYYY-MM' -> índice absoluto de mes (para contar y comparar sin fechas). */
const idxMes = (ym: string) => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return y * 12 + (m - 1);
};

/**
 * Parte del monto que le toca a la ventana consultada.
 *
 * Un presupuesto de ago–sep mirado sólo en agosto vale la mitad: el monto se
 * reparte en partes iguales entre los meses del presupuesto y se devuelven los
 * que caen dentro del filtro. Si no hay filtro, vale entero.
 */
function prorratear(
  monto: number,
  mesDesde: string,
  mesHasta: string,
  desde: string,
  hasta: string,
): { meses: number; mesesPeriodo: number; montoPeriodo: number } {
  const a = idxMes(mesDesde);
  const b = idxMes(mesHasta);
  const meses = b - a + 1;
  if (!desde || !hasta) return { meses, mesesPeriodo: meses, montoPeriodo: monto };
  const solapa = Math.min(b, idxMes(hasta)) - Math.max(a, idxMes(desde)) + 1;
  const mesesPeriodo = Math.max(0, solapa);
  return {
    meses,
    mesesPeriodo,
    montoPeriodo: Math.round(((monto * mesesPeriodo) / meses) * 100) / 100,
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde")?.trim() || "";
  const hasta = sp.get("hasta")?.trim() || "";
  for (const [nombre, v] of [
    ["desde", desde],
    ["hasta", hasta],
  ] as const) {
    if (v && !YM.test(v)) {
      return NextResponse.json(
        { error: `'${nombre}' inválido: se espera YYYY-MM` },
        { status: 400 },
      );
    }
  }

  try {
    // Solapamiento de rangos: empieza antes de que termine el filtro y termina
    // después de que empieza. Con las dos columnas indexadas y una tabla de
    // pocas filas no hace falta nada más.
    const where =
      desde && hasta
        ? { mesDesde: { lte: hasta }, mesHasta: { gte: desde } }
        : {};
    const filas = await prisma.finanza_presupuesto_area.findMany({
      where,
      orderBy: [{ mesDesde: "desc" }, { codigoArea: "asc" }],
    });

    return NextResponse.json({
      desde: desde || null,
      hasta: hasta || null,
      presupuestos: filas.map((f) => {
        const monto = Number(f.monto);
        return {
          id: f.id,
          codigoArea: f.codigoArea,
          area: f.area,
          mesDesde: f.mesDesde.trim(),
          mesHasta: f.mesHasta.trim(),
          monto,
          nota: f.nota,
          ...prorratear(monto, f.mesDesde.trim(), f.mesHasta.trim(), desde, hasta),
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/finanza/presupuestos/aprobados", error);
    return NextResponse.json(
      { error: "No se pudieron leer los presupuestos aprobados" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => null);
  const codigoArea = Number(body?.codigoArea);
  const area = String(body?.area ?? "").trim().slice(0, 120);
  const mesDesde = String(body?.mesDesde ?? "").trim();
  const mesHasta = String(body?.mesHasta ?? "").trim();
  const millones = Number(body?.montoMillones);
  const nota = body?.nota ? String(body.nota).trim().slice(0, 200) : null;

  if (!Number.isInteger(codigoArea) || codigoArea <= 0)
    return NextResponse.json({ error: "Área inválida" }, { status: 400 });
  if (!area) return NextResponse.json({ error: "Falta el nombre del área" }, { status: 400 });
  if (!YM.test(mesDesde) || !YM.test(mesHasta))
    return NextResponse.json({ error: "Período inválido: se espera YYYY-MM" }, { status: 400 });
  if (idxMes(mesDesde) > idxMes(mesHasta))
    return NextResponse.json({ error: "El mes desde es posterior al hasta" }, { status: 400 });
  if (idxMes(mesHasta) - idxMes(mesDesde) + 1 > MAX_MESES)
    return NextResponse.json(
      { error: `El período no puede superar los ${MAX_MESES} meses` },
      { status: 400 },
    );
  if (!Number.isFinite(millones) || millones <= 0)
    return NextResponse.json(
      { error: "El monto aprobado tiene que ser mayor a 0 (en millones)" },
      { status: 400 },
    );

  const monto = Math.round(millones * MILLON * 100) / 100;
  const s = await getSession();

  try {
    // Mismo área + mismo período = corrección del monto, no un presupuesto
    // nuevo (lo garantiza la UNIQUE de la tabla).
    const fila = await prisma.finanza_presupuesto_area.upsert({
      where: {
        codigoArea_mesDesde_mesHasta: { codigoArea, mesDesde, mesHasta },
      },
      create: { codigoArea, area, mesDesde, mesHasta, monto, nota, creadoPor: s?.uid ?? null },
      update: { area, monto, nota },
    });
    return NextResponse.json({ ok: true, id: fila.id });
  } catch (error) {
    console.error("POST /api/finanza/presupuestos/aprobados", error);
    return NextResponse.json(
      { error: "No se pudo guardar el presupuesto" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const g = await requireAdmin();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    await prisma.finanza_presupuesto_area.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/finanza/presupuestos/aprobados", error);
    return NextResponse.json(
      { error: "No se pudo borrar el presupuesto" },
      { status: 500 },
    );
  }
}
