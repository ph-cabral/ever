import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fuente NUEVA de /deposito/faltantes: WMS (renglones de OT Picking Cumplida con
// diferencia pedida/cumplida), ya no Magnus Ven_PedRenPendientes. Se persiste en
// preparado.faltante_wms (best-effort, auto, no se carga nada a mano) y se
// devuelve con los MISMOS nombres de campo de siempre (NroPedOrigen/NroRengOrigen
// = alias de NroMovVenta/Renglon de la OT) para que check, novedad y
// compras/faltantes-consumo sigan funcionando sin cambios: tratan esa clave como
// opaca, no como algo específico de Magnus.
//
// Gap conocido: Nombre / Importe / TipoArticulo / Linea / Proveedor todavía no
// tienen fuente en WMS (van vacíos/0) — falta un join a StkFer_Articulos /
// PrecioVenta si se necesitan en la grilla.
interface OtDifRow {
  OTId: number;
  NroMovVenta: number | null;
  Fecha: string | null;
  Operario: string;
  Cliente: string | number | null;
  Vendedor: string;
  Ubicacion: string;
  CodArticulo: string;
  Renglon: number;
  CantPedida: number;
  CantCumplida: number;
  Diferencia: number;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const qs = new URLSearchParams();
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (desde) qs.set("desde", desde);
  if (hasta) qs.set("hasta", hasta);

  let json: { desde: string | null; hasta: string | null; rows: OtDifRow[] };
  try {
    const res = await fetch(
      `${API_URL}/deposito/ot-diferencias${qs.toString() ? `?${qs}` : ""}`,
      { cache: "no-store", signal: AbortSignal.timeout(45000) },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de depósito (ot-diferencias)", detail },
        { status: res.status },
      );
    }
    json = await res.json();
  } catch (error) {
    console.error("GET /api/deposito/faltantes", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }

  const raw = json.rows ?? [];

  // Persistir (best-effort): la tabla puede no estar creada aún
  // (ver prisma/sql/faltante_wms.sql).
  let persistWarn = false;
  if (raw.length) {
    try {
      const values = raw.map(
        (r) =>
          Prisma.sql`(${r.Fecha}::date, ${r.OTId}, ${r.Renglon}, ${r.NroMovVenta}, ${r.Renglon}, ${r.Operario}, ${String(r.Cliente ?? "")}, ${r.Vendedor}, ${r.Ubicacion}, ${r.CodArticulo}, ${r.CantPedida}, ${r.CantCumplida}, ${r.Diferencia}, now())`,
      );
      await prisma.$executeRaw`
        INSERT INTO preparado.faltante_wms
          (fecha, "otId", renglon, "nroPedOrigen", "nroRengOrigen", operario, cliente, vendedor, ubicacion, "codArticulo", "cantPedida", "cantCumplida", diferencia, "updatedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("otId", renglon) DO UPDATE SET
          "cantPedida"   = EXCLUDED."cantPedida",
          "cantCumplida" = EXCLUDED."cantCumplida",
          diferencia     = EXCLUDED.diferencia,
          "updatedAt"    = now()
      `;
    } catch (e) {
      persistWarn = true;
      console.error("persist faltante_wms", e);
    }
  }

  const rows = raw
    .map((r) => ({
      NroPedOrigen: r.NroMovVenta,
      NroRengOrigen: r.Renglon,
      Ubicacion: r.Ubicacion,
      CodArticulo: r.CodArticulo,
      Nombre: "", // TODO: falta join a StkFer_Articulos
      CantPend: r.Diferencia,
      Cliente: r.Cliente,
      Importe: 0, // TODO: falta join a PrecioVenta
      TipoArticulo: null as string | null,
      Preparador: r.Operario,
      Linea: null as string | number | null,
      Proveedor: null as string | null,
      Vendedor: r.Vendedor,
      Fecha: r.Fecha,
    }))
    .sort((a, b) =>
      String(a.Ubicacion) < String(b.Ubicacion)
        ? -1
        : String(a.Ubicacion) > String(b.Ubicacion)
          ? 1
          : 0,
    );

  return NextResponse.json({
    fecha: json.desde,
    desde: json.desde,
    hasta: json.hasta,
    total: rows.length,
    rows,
    persistWarn,
  });
}
