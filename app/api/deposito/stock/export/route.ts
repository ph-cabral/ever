import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const API_URL =
  process.env.INDICADORES_API_URL ?? "http://indicadores-api:8001";

export const dynamic = "force-dynamic";

// Proxy → FastAPI indicadores-api: TODO el stock (sin paginar), por depósito
// 1/2/3 + total. A diferencia de /api/deposito/stock (vista paginada), este
// arma el .xlsx acá mismo (lib "xlsx" ya es dependencia del proyecto) con el
// 100% de los artículos y lo devuelve para descarga directa.
export async function GET() {
  try {
    const res = await fetch(`${API_URL}/deposito/stock/export`, {
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: "Error en API de stock", detail },
        { status: res.status },
      );
    }
    const { rows } = await res.json();

    const data = (rows ?? []).map((r: Record<string, unknown>) => ({
      Código: r.CodArticulo,
      Nombre: r.Nombre,
      "Depósito 1": r.Stock1,
      "Depósito 2": r.Stock2,
      "Depósito 3": r.Stock3,
      Total: r.StockTotal,
      Proveedor: r.Proveedor,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const fecha = new Date().toISOString().slice(0, 10);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock_${fecha}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("GET /api/deposito/stock/export", error);
    return NextResponse.json(
      { error: "No se pudo conectar al servicio de depósito" },
      { status: 503 },
    );
  }
}
