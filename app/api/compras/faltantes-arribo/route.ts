import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveBucketRenglones, type BucketRenglon } from "@/lib/faltantesArribo";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ──────────────────────────────────────────────────────────────────────────────
// /compras/faltantes — carga fecha de arribo a nivel (artículo, día de 1ª
//   aparición del bucket), con fan-out a preparado.faltante_control por
//   renglón. Reemplaza a /deposito/faltantes/control como punto de carga de
//   fechaArribo (esa pantalla ahora redirige acá).
//
//   POST { fecha, codArticulo, fechaArribo: string|null }
//     · fecha       = PrimerDia del bucket (el "Día" que muestra la tabla de
//                     compras), NO la fecha de hoy.
//     · fechaArribo = null para borrar la fecha cargada.
//
//   Además deja el PASE A COMPRAS registrado en preparado.faltante_pase_compras
//   (sql/compras_faltante_pase.sql): cargar la fecha de arribo es el momento en
//   que el faltante pasa a compras, y la fila guarda la FOTO de ese momento
//   (faltan/descubierto/OC/stock que manda el cliente en `snapshot`) para poder
//   comparar a fin de mes contra lo comprado (ver /compras/pases). Borrar la
//   fecha borra el registro (se deshizo el pase). Es best-effort: si la tabla
//   no está aplicada, el arribo se guarda igual y la respuesta trae paseWarn.
//
//   No se toca esquema ni /ventas/faltantes: se sigue escribiendo
//   preparado.faltante_control por (fecha, nroPedOrigen, nroRengOrigen), donde
//   esa "fecha" es la que ya usa el resto del pipeline (ver
//   lib/faltantesArribo.ts — BucketRenglon.fecha).
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const primerDia = body?.fecha;
  const codArticulo = body?.codArticulo;
  const fechaArribo: string | null = body?.fechaArribo || null;

  if (!primerDia || typeof primerDia !== "string" || !codArticulo || typeof codArticulo !== "string") {
    return NextResponse.json({ error: "fecha y codArticulo son requeridos" }, { status: 400 });
  }

  let renglones: BucketRenglon[];
  try {
    renglones = await resolveBucketRenglones(codArticulo, primerDia);
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo resolver el bucket (indicadores-api)", detail: String(e) },
      { status: 503 },
    );
  }
  if (!renglones.length) {
    return NextResponse.json(
      { error: "No hay renglones sin existencia para ese artículo/día" },
      { status: 404 },
    );
  }

  try {
    await prisma.$transaction(
      renglones.map((r) =>
        prisma.$executeRaw`
          INSERT INTO preparado.faltante_control
            (fecha, "nroPedOrigen", "nroRengOrigen", "codArticulo", "fechaArribo", "updatedAt")
          VALUES (${r.fecha}::date, ${r.nroPedOrigen}, ${r.nroRengOrigen}, ${codArticulo}, ${fechaArribo}::date, now())
          ON CONFLICT (fecha, "nroPedOrigen", "nroRengOrigen") DO UPDATE SET
            "fechaArribo" = EXCLUDED."fechaArribo",
            "updatedAt"   = now()
        `,
      ),
    );
    // ── Registro del pase a compras (best-effort, no rompe el guardado) ──
    let paseWarn = false;
    try {
      if (fechaArribo) {
        const snap = body?.snapshot ?? {};
        const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
        const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
        const session = await getSession();
        // "pasadoEl" NO se pisa en el UPDATE: si compras corrige la fecha de
        // arribo días después, el pase sigue contando en el mes en que se hizo.
        await prisma.$executeRaw`
          INSERT INTO preparado.faltante_pase_compras
            (fecha, "codArticulo", nombre, proveedor, linea, faltan, descubierto,
             "ocTotal", stock, importe, importacion, "fechaArribo", usuario,
             "pasadoEl", "updatedAt")
          VALUES (
            ${primerDia}::date, ${codArticulo}, ${txt(snap.nombre)}, ${txt(snap.proveedor)},
            ${txt(snap.linea)}, ${num(snap.faltan)}, ${num(snap.descubierto)},
            ${num(snap.ocTotal)}, ${num(snap.stock)}, ${num(snap.importe)},
            ${snap.importacion === true}, ${fechaArribo}::date,
            ${session?.nombre ?? null}, now(), now()
          )
          ON CONFLICT (fecha, "codArticulo") DO UPDATE SET
            "fechaArribo" = EXCLUDED."fechaArribo",
            "updatedAt"   = now()
        `;
      } else {
        await prisma.$executeRaw`
          DELETE FROM preparado.faltante_pase_compras
          WHERE fecha = ${primerDia}::date AND "codArticulo" = ${codArticulo}
        `;
      }
    } catch {
      paseWarn = true;
    }

    return NextResponse.json({
      ok: true,
      fecha: primerDia,
      codArticulo,
      fechaArribo,
      renglones: renglones.length,
      paseWarn,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo guardar (¿falta aplicar faltante_control.sql?)", detail: String(e) },
      { status: 500 },
    );
  }
}
