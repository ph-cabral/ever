"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, Download, ShoppingCart, PackageX, Check,
} from "lucide-react";
import * as XLSX from "xlsx";
import { InicioButton } from "@/components/ui/InicioButton";
import { UsuarioActual } from "@/components/auth/UsuarioActual";
import { abrirPicker } from "@/components/ui/abrirPicker";

// ──────────────────────────────────────────────────────────────────────────────
// /compras/pases — registro de los faltantes que PASARON A COMPRAS, por mes.
//   Un faltante se registra como "pasado a compras" cuando en /compras/faltantes
//   se le carga la FECHA DE ARRIBO (ese es el momento en que compras se hace
//   cargo). El registro guarda la foto de ese momento (faltan, descubierto, OC,
//   stock) en preparado.faltante_pase_compras y NO se recalcula después.
//   Al lado, lo efectivamente COMPRADO del mes (unidades de OC hechas ese mes,
//   por artículo) para la comparación de fin de mes.
//   Fuente: /api/compras/pases?mes=YYYY-MM.
// ──────────────────────────────────────────────────────────────────────────────

interface Row {
  fecha: string;
  codArticulo: string;
  nombre: string | null;
  proveedor: string | null;
  linea: string | null;
  faltan: number;
  descubierto: number;
  ocTotal: number;
  stock: number;
  importe: number;
  importacion: boolean;
  fechaArribo: string | null;
  usuario: string | null;
  pasadoEl: string;
  compradoUnidades: number;
  comprado: boolean;
}
interface Totales {
  pases: number;
  articulos: number;
  faltan: number;
  descubierto: number;
  importe: number;
  conCompra: number;
  compradoUnidades: number;
}
interface Resp {
  mes: string;
  desde: string;
  hasta: string;
  rows: Row[];
  totales: Totales;
  tablaWarn: boolean;
  compradoWarn: boolean;
}

const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtAr = (s: string | null) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};
const mesActual = () => new Date().toISOString().slice(0, 7);

export default function PasesPage() {
  const [mes, setMes] = useState(mesActual);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soloSinComprar, setSoloSinComprar] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compras/pases?mes=${mes}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("No se pudo cargar el registro de pases");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(
    () => (data ? (soloSinComprar ? data.rows.filter((r) => !r.comprado) : data.rows) : []),
    [data, soloSinComprar],
  );

  const exportar = useCallback(() => {
    if (!visibles.length) return;
    const filas = visibles.map((r) => ({
      "Pasado el": r.pasadoEl.slice(0, 10),
      "Día faltante": r.fecha,
      "Código": r.codArticulo,
      "Artículo": r.nombre || "",
      Proveedor: r.proveedor || "",
      "Línea": r.linea || "",
      Faltan: r.faltan,
      "Falta OC": r.descubierto,
      "En OC": r.ocTotal,
      Stock: r.stock,
      Importe: r.importe,
      Arribo: r.fechaArribo || "",
      "Comprado (u)": r.compradoUnidades,
      "¿Comprado?": r.comprado ? "Sí" : "No",
      Usuario: r.usuario || "",
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const cols = Object.keys(filas[0]);
    ws["!cols"] = cols.map((c) => {
      let max = c.length;
      for (const f of filas) max = Math.max(max, String((f as Record<string, unknown>)[c] ?? "").length);
      return { wch: Math.min(Math.max(max + 2, 8), 50) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pases a compras");
    XLSX.writeFile(wb, `pases_compras_${mes}.xlsx`);
  }, [visibles, mes]);

  const t = data?.totales;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <InicioButton />
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <ShoppingCart size={18} className="text-yellow-400" />
          Pasados a compras
        </h1>
        <span className="text-[11px] text-zinc-500">
          se registra al cargar la fecha de arribo en Faltantes
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="month"
            onClick={abrirPicker}
            value={mes}
            onChange={(e) => setMes(e.target.value || mesActual())}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-yellow-400 cursor-pointer"
          />
          <button
            onClick={() => setSoloSinComprar((v) => !v)}
            title="Ver solo los que todavía no tienen ninguna OC hecha en el mes"
            className={`chip-anim flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium ${
              soloSinComprar
                ? "bg-red-500/15 border-red-400 text-red-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            <PackageX size={14} />
            Sin comprar
            {soloSinComprar && <Check size={13} />}
          </button>
          <button
            onClick={exportar}
            disabled={!visibles.length}
            className="btn-anim flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-yellow-400 hover:text-yellow-400 text-xs disabled:opacity-40"
          >
            <Download size={14} /> Excel
          </button>
          <button
            onClick={cargar}
            className="btn-anim flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-yellow-400 hover:text-yellow-400 text-xs"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Actualizar
          </button>
          <UsuarioActual />
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 text-red-400 text-sm">
          <AlertTriangle size={15} /> {error}
        </div>
      )}
      {data?.tablaWarn && (
        <div className="mb-3 flex items-center gap-2 text-amber-400 text-xs">
          <AlertTriangle size={14} />
          Falta aplicar sql/compras_faltante_pase.sql — todavía no se registra ningún pase.
        </div>
      )}
      {data?.compradoWarn && (
        <div className="mb-3 flex items-center gap-2 text-amber-400 text-xs">
          <AlertTriangle size={14} />
          No se pudo leer lo comprado del mes (indicadores-api) — la columna Comprado queda en 0.
        </div>
      )}

      {t && (
        <div className="mb-3 text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <b className="text-yellow-400">{t.pases}</b> pases · {t.articulos} art.
          </span>
          <span>
            faltan <b className="text-zinc-200">{fmtNum(t.faltan)}</b>
          </span>
          <span>
            faltan OC <b className="text-red-400">{fmtNum(t.descubierto)}</b>
          </span>
          <span>
            con OC en el mes <b className="text-green-400">{t.conCompra}</b>/{t.articulos} art.
          </span>
          <span>
            comprado <b className="text-green-400">{fmtNum(t.compradoUnidades)}</b> u.
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-xs">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-2 py-2 text-left">Pasado</th>
              <th className="px-2 py-2 text-left">Día falt.</th>
              <th className="px-2 py-2 text-left">Código</th>
              <th className="px-2 py-2 text-left">Artículo</th>
              <th className="px-2 py-2 text-left">Proveedor</th>
              <th className="px-2 py-2 text-right">Faltan</th>
              <th className="px-2 py-2 text-right">Falta OC</th>
              <th className="px-2 py-2 text-right">En OC</th>
              <th className="px-2 py-2 text-right">Stock</th>
              <th className="px-2 py-2 text-left">Arribo</th>
              <th className="px-2 py-2 text-right">Comprado</th>
              <th className="px-2 py-2 text-left">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr
                key={`${r.fecha}|${r.codArticulo}`}
                className={`border-t border-zinc-800 ${r.comprado ? "" : "bg-red-500/5"}`}
              >
                <td className="px-2 py-1.5 text-zinc-400 whitespace-nowrap">
                  {fmtAr(r.pasadoEl.slice(0, 10))}
                </td>
                <td className="px-2 py-1.5 text-zinc-400 whitespace-nowrap">{fmtAr(r.fecha)}</td>
                <td className="px-2 py-1.5 font-mono text-yellow-400">{r.codArticulo}</td>
                <td className="px-2 py-1.5">{r.nombre || "—"}</td>
                <td className="px-2 py-1.5 text-zinc-400">{r.proveedor || "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(r.faltan)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-red-400">
                  {fmtNum(r.descubierto)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400">
                  {fmtNum(r.ocTotal)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400">
                  {fmtNum(r.stock)}
                </td>
                <td className="px-2 py-1.5 text-zinc-400 whitespace-nowrap">
                  {fmtAr(r.fechaArribo)}
                </td>
                <td
                  className={`px-2 py-1.5 text-right tabular-nums ${
                    r.comprado ? "text-green-400" : "text-zinc-600"
                  }`}
                >
                  {fmtNum(r.compradoUnidades)}
                </td>
                <td className="px-2 py-1.5 text-zinc-500">{r.usuario || "—"}</td>
              </tr>
            ))}
            {!loading && visibles.length === 0 && (
              <tr>
                <td colSpan={12} className="px-2 py-6 text-center text-zinc-500">
                  No hay pases registrados en este mes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
