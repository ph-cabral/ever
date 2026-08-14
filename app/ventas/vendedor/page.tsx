"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Loader2, AlertTriangle, Search, Users, Table2, ChevronDown, ChevronUp,
  ArrowLeftRight,
} from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";

// ──────────────────────────────────────────────────────────────────────────────
// /ventas/vendedor — pedido de Pablo 2026-08-14: vista de ventas por línea de
// artículo de UN cliente, con año actual y año anterior lado a lado.
//
//   · Filtro arriba: búsqueda de cliente por código O por nombre (substring),
//     autocomplete contra /api/ventas/vendedor/clientes. Elegir un cliente de
//     la lista y presionar "Filtrar" (o Enter) — la tabla NO se carga sola,
//     solo al presionar el botón (mismo criterio que /compras/consumo).
//   · Switch "Unidades / Pesos": cambia qué valor muestra la tabla (cantidad
//     neta vendida vs. monto neto vendido) — mismos datos, otra columna.
//   · Tabla: primera columna = línea de artículo (StkFer_ArtParamet.Nivel1),
//     agrupando los artículos. El resto son año anterior y año en curso
//     (total). Botón "Desglosar" separa cada año en sus 12 meses,
//     manteniendo la agrupación por año (encabezado de 2 filas: año arriba,
//     mes abajo) — "Agrupar" vuelve a colapsar a un total por año.
//
//   Fuente: /api/ventas/vendedor → indicadores-api fetch_ventas_por_linea
//   (Ven_CompCabecera + Ven_CompRenglon, venta NETA de nota de crédito, mismo
//   criterio ya verificado contra el pivot Excel real — ver
//   HANDOFF_extracciones_sql.md).
// ──────────────────────────────────────────────────────────────────────────────

interface Cliente {
  numero: number;
  nombre: string | null;
}

interface MesVal {
  mes: number;
  label: string;
  cantidad: number;
  monto: number;
}

interface AnioVal {
  cantidad: number;
  monto: number;
  meses: MesVal[];
}

interface LineaRow {
  linea: string;
  anioAnterior: AnioVal;
  anioActual: AnioVal;
}

interface RespVentasVendedor {
  cliente: { codigo: number; nombre: string | null };
  anioAnterior: number;
  anioActual: number;
  tieneDatos: boolean;
  lineas: LineaRow[];
  totales: { anioAnterior: AnioVal; anioActual: AnioVal };
}

type Modo = "unidades" | "pesos";

const fmtNum = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtMoney = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n || 0);

// Texto mostrado en el input una vez elegido un cliente de la lista — se usa
// también para detectar "no volver a buscar" en el efecto de abajo.
const labelCliente = (c: Cliente) => (c.nombre ? `${c.nombre} (${c.numero})` : String(c.numero));

export default function VentasVendedorPage() {
  // ── Búsqueda / selección de cliente ────────────────────────────────────
  const [qCliente, setQCliente] = useState("");
  const [sugerencias, setSugerencias] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSug, setMostrarSug] = useState(false);
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const texto = qCliente.trim();
    // Recién elegido de la lista (ver elegirCliente) — el input ya muestra
    // "Nombre (código)" y no hace falta volver a buscar nada.
    if (!texto || (clienteSel && texto === labelCliente(clienteSel))) {
      setSugerencias([]);
      return;
    }
    if (texto.length < 2) {
      setSugerencias([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ventas/vendedor/clientes?q=${encodeURIComponent(texto)}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        setSugerencias(Array.isArray(j?.clientes) ? j.clientes : []);
        setMostrarSug(true);
      } catch {
        setSugerencias([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qCliente]);

  const elegirCliente = useCallback((c: Cliente) => {
    setClienteSel(c);
    setQCliente(labelCliente(c));
    setSugerencias([]);
    setMostrarSug(false);
  }, []);

  // ── Tabla: se carga SOLO al presionar "Filtrar" ────────────────────────
  const [data, setData] = useState<RespVentasVendedor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("unidades");
  const [desglosado, setDesglosado] = useState(false);

  const handleFiltrar = useCallback(async () => {
    if (!clienteSel) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ventas/vendedor?cliente=${clienteSel.numero}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [clienteSel]);

  const valor = useCallback((a: AnioVal) => (modo === "unidades" ? a.cantidad : a.monto), [modo]);
  const valorMes = useCallback(
    (m: MesVal) => (modo === "unidades" ? m.cantidad : m.monto),
    [modo],
  );
  const fmt = modo === "unidades" ? fmtNum : fmtMoney;

  const filas = data?.lineas ?? [];
  const hayTabla = !!data;
  const sinDatos = !!data && !data.tieneDatos;

  const colSpanAnio = desglosado ? 13 : 1;

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {(loading || error) && (
        <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2">
          {loading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" /> Consultando la base…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300">
              <AlertTriangle size={16} className="text-red-400" /> {error}
            </div>
          )}
        </div>
      )}

      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex items-center justify-between px-4 md:px-8 h-16 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <InicioButton />
          <span className="font-bold text-yellow-400 text-xl md:text-2xl tracking-wide uppercase whitespace-nowrap">
            EVER WEAR <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="hidden md:block w-px h-7 bg-yellow-400/30" />
          <span className="hidden md:inline text-zinc-500 text-sm">Ventas · Por vendedor</span>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-yellow-400 font-bold text-xl uppercase tracking-wide flex items-center gap-2">
            <Users size={20} /> Ventas por cliente y línea
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Buscá un cliente por código o nombre y presioná Filtrar. La tabla agrupa por línea
            de artículo, comparando el año en curso contra el anterior.
          </p>
        </div>

        {/* Filtro */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5 relative">
            <label htmlFor="filtro-cliente" className="text-xs text-zinc-400 uppercase tracking-wide">
              Cliente (código o nombre)
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                id="filtro-cliente"
                type="text"
                value={qCliente}
                onChange={(e) => {
                  setQCliente(e.target.value);
                  setClienteSel(null);
                }}
                onFocus={() => sugerencias.length > 0 && setMostrarSug(true)}
                onBlur={() => {
                  blurTimeout.current = setTimeout(() => setMostrarSug(false), 150);
                }}
                onKeyDown={(e) => e.key === "Enter" && clienteSel && handleFiltrar()}
                placeholder="Ej: 1234 o ACME S.A."
                autoFocus
                className="bg-[#1f1f1f] border border-zinc-700 rounded-md pl-7 pr-3 py-2 text-sm text-zinc-100 outline-none w-72 focus:border-yellow-400 placeholder:text-zinc-600"
              />
              {buscando && (
                <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />
              )}
              {mostrarSug && sugerencias.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-zinc-700 bg-[#1A1A1A] shadow-xl">
                  {sugerencias.map((c) => (
                    <button
                      key={c.numero}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (blurTimeout.current) clearTimeout(blurTimeout.current);
                        elegirCliente(c);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-yellow-400/10 hover:text-yellow-400 transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{c.nombre ?? "(sin nombre)"}</span>
                      <span className="text-zinc-500 font-mono text-xs shrink-0">{c.numero}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleFiltrar}
            disabled={loading || !clienteSel}
            title={clienteSel ? "Cargar la tabla de este cliente" : "Elegí un cliente de la lista primero"}
            className="btn-anim flex items-center gap-2 bg-yellow-400 text-black font-semibold text-sm rounded-md px-4 py-2 disabled:opacity-40"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Filtrar
          </button>

          {/* Switch unidades / pesos */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-zinc-400 uppercase tracking-wide">Mostrar</span>
            <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setModo("unidades")}
                className={`px-3 py-2 transition-colors ${
                  modo === "unidades" ? "bg-yellow-400 text-black font-semibold" : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                Unidades
              </button>
              <button
                type="button"
                onClick={() => setModo("pesos")}
                className={`px-3 py-2 transition-colors inline-flex items-center gap-1 ${
                  modo === "pesos" ? "bg-yellow-400 text-black font-semibold" : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <ArrowLeftRight size={12} /> Pesos
              </button>
            </div>
          </div>

          {hayTabla && (
            <button
              type="button"
              onClick={() => setDesglosado((v) => !v)}
              className="btn-anim flex items-center gap-1.5 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-2 hover:border-yellow-400 transition-colors"
            >
              {desglosado ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              {desglosado ? "Agrupar por año" : "Desglosar por mes"}
            </button>
          )}

          {data && (
            <span className="text-sm text-zinc-500 pb-2">
              {data.cliente.nombre ?? "—"} ({data.cliente.codigo}) — {filas.length} línea(s)
            </span>
          )}
        </div>

        {!hayTabla && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
            <Search size={40} className="text-zinc-700" />
            <p className="text-zinc-500 text-sm">
              Buscá un cliente por código o nombre, elegilo de la lista y presioná Filtrar.
            </p>
          </div>
        )}

        {hayTabla && sinDatos && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
            <Table2 size={40} className="text-zinc-700" />
            <p className="text-zinc-500 text-sm">
              Sin ventas registradas para {data?.cliente.nombre ?? data?.cliente.codigo} en{" "}
              {data?.anioAnterior}–{data?.anioActual}.
            </p>
          </div>
        )}

        {hayTabla && !sinDatos && (
          <div
            className={`rounded-xl border border-zinc-800 overflow-hidden transition-opacity ${
              loading ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-[#1A1A1A] text-zinc-400">
                  <tr>
                    <th rowSpan={desglosado ? 2 : 1} className="px-3 py-2 font-medium text-left whitespace-nowrap align-bottom">
                      Línea
                    </th>
                    <th
                      colSpan={colSpanAnio}
                      className="px-3 py-2 font-medium text-center whitespace-nowrap border-l border-zinc-800 text-zinc-300"
                    >
                      Año {data!.anioAnterior}
                    </th>
                    <th
                      colSpan={colSpanAnio}
                      className="px-3 py-2 font-medium text-center whitespace-nowrap border-l border-zinc-800 text-yellow-400"
                    >
                      Año {data!.anioActual}
                    </th>
                  </tr>
                  {desglosado && (
                    <tr className="text-[11px] text-zinc-500">
                      {data!.totales.anioAnterior.meses.map((m) => (
                        <th key={`pa-${m.mes}`} className="px-2 py-1.5 font-normal text-right whitespace-nowrap border-l border-zinc-800/60">
                          {m.label}
                        </th>
                      ))}
                      <th className="px-2 py-1.5 font-semibold text-right whitespace-nowrap border-l border-zinc-800 text-zinc-300">
                        Total
                      </th>
                      {data!.totales.anioActual.meses.map((m) => (
                        <th key={`pc-${m.mes}`} className="px-2 py-1.5 font-normal text-right whitespace-nowrap border-l border-zinc-800/60">
                          {m.label}
                        </th>
                      ))}
                      <th className="px-2 py-1.5 font-semibold text-right whitespace-nowrap border-l border-zinc-800 text-yellow-400">
                        Total
                      </th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filas.map((r) => (
                    <tr key={r.linea} className="border-t border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                      <td className="px-3 py-2 text-zinc-100 whitespace-nowrap">{r.linea}</td>
                      {desglosado &&
                        r.anioAnterior.meses.map((m) => (
                          <td key={`a-${m.mes}`} className="px-2 py-2 text-right tabular-nums text-zinc-400 border-l border-zinc-800/40">
                            {valorMes(m) === 0 ? "—" : fmt(valorMes(m))}
                          </td>
                        ))}
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-200 font-medium border-l border-zinc-800">
                        {fmt(valor(r.anioAnterior))}
                      </td>
                      {desglosado &&
                        r.anioActual.meses.map((m) => (
                          <td key={`c-${m.mes}`} className="px-2 py-2 text-right tabular-nums text-zinc-400 border-l border-zinc-800/40">
                            {valorMes(m) === 0 ? "—" : fmt(valorMes(m))}
                          </td>
                        ))}
                      <td className="px-3 py-2 text-right tabular-nums text-yellow-400 font-semibold border-l border-zinc-800">
                        {fmt(valor(r.anioActual))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-700 bg-zinc-900/60">
                    <td className="px-3 py-2 text-zinc-300 font-semibold uppercase text-xs tracking-wide">
                      Total
                    </td>
                    {desglosado &&
                      data!.totales.anioAnterior.meses.map((m) => (
                        <td key={`ta-${m.mes}`} className="px-2 py-2 text-right tabular-nums text-zinc-300 font-medium border-l border-zinc-800/40">
                          {fmt(valorMes(m))}
                        </td>
                      ))}
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-100 font-bold border-l border-zinc-800">
                      {fmt(valor(data!.totales.anioAnterior))}
                    </td>
                    {desglosado &&
                      data!.totales.anioActual.meses.map((m) => (
                        <td key={`tc-${m.mes}`} className="px-2 py-2 text-right tabular-nums text-zinc-300 font-medium border-l border-zinc-800/40">
                          {fmt(valorMes(m))}
                        </td>
                      ))}
                    <td className="px-3 py-2 text-right tabular-nums text-yellow-400 font-bold border-l border-zinc-800">
                      {fmt(valor(data!.totales.anioActual))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
