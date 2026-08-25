"use client";
import { useState, useEffect } from "react";
import {
  Search, Loader2, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw,
  Download,
} from "lucide-react";
import { PageTitle, Panel, Table, fmtNum } from "../components/ui";
import { InicioButton } from "@/components/ui/InicioButton";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

// ──────────────────────────────────────────────────────────────────────────────
// Stock — todos los depósitos (1/2/3) + total. +4mil artículos: la vista nunca
// trae todos de un tiro, se pagina server-side contra /api/deposito/stock
// (indicadores-api agrupa+pagina en WMS.UbicacionDetalle, pivot por depósito).
// El botón "Exportar Excel" sí trae el 100% del stock (sin paginar), vía
// /api/deposito/stock/export.
// ──────────────────────────────────────────────────────────────────────────────

interface StockRow {
  CodArticulo: string;
  Nombre: string;
  Stock1: number;
  Stock2: number;
  Stock3: number;
  StockTotal: number;
  Proveedor: string;
}

const PAGE_SIZE = 50;

export default function DepositoStockPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Búsqueda con debounce → resetea a página 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (qDebounced) params.set("q", qDebounced);
    fetch(`/api/deposito/stock?${params}`, { cache: "no-store" })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        if (!cancel) setRows(j.rows ?? []);
      })
      .catch((e) => {
        if (!cancel) {
          setError(e instanceof Error ? e.message : "Error al cargar");
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [page, qDebounced, reloadTick]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/deposito/stock/export");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stock_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <InicioButton label="Inicio" iconSize={14} className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors" />
          <UsuarioActual />
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <PageTitle
            title="Stock — Todos los depósitos"
            sub="Existencia por artículo y depósito (1/2/3) + total · suma de todas sus ubicaciones · SQL en vivo (WMS)"
          />
          <div className="flex items-center gap-2 mt-1">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar código…"
                className="bg-[#1f1f1f] border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-zinc-100 focus:border-yellow-400 outline-none w-56"
              />
            </div>
            <button
              onClick={() => setReloadTick((t) => t + 1)}
              title="Refrescar"
              disabled={loading}
              className="text-zinc-400 hover:text-yellow-400 transition-colors p-2 disabled:opacity-40"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              title="Exportar 100% del stock a Excel"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-200 hover:border-yellow-400 disabled:opacity-40 transition-colors"
            >
              {exporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Exportar Excel
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-300 text-sm mb-3">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <Panel bodyClass="p-0">
          <Table<StockRow>
            cols={[
              { key: "CodArticulo", label: "Código" },
              { key: "Nombre", label: "Nombre" },
              {
                key: "Stock1",
                label: "Depósito 1",
                num: true,
                render: (r) => fmtNum(r.Stock1),
              },
              {
                key: "Stock2",
                label: "Depósito 2",
                num: true,
                render: (r) => fmtNum(r.Stock2),
              },
              {
                key: "Stock3",
                label: "Depósito 3",
                num: true,
                render: (r) => fmtNum(r.Stock3),
              },
              {
                key: "StockTotal",
                label: "Total",
                num: true,
                render: (r) => fmtNum(r.StockTotal),
              },
              { key: "Proveedor", label: "Proveedor" },
            ]}
            rows={rows}
            max={PAGE_SIZE}
            maxH={620}
            empty={loading ? "Consultando la base…" : "Sin resultados"}
          />
        </Panel>

        <div className="flex items-center justify-between mt-3 text-sm text-zinc-400">
          <span>
            Página {page}
            {rows.length < PAGE_SIZE ? " (última)" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-700 disabled:opacity-30 hover:border-yellow-400"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={rows.length < PAGE_SIZE || loading}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-700 disabled:opacity-30 hover:border-yellow-400"
            >
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Loader2 size={32} className="text-yellow-400 animate-spin" />
          </div>
        )}

        <p className="text-[11px] text-zinc-600 mt-6 leading-relaxed">
          Stock = suma de UbicacionDetalleCantidad (WMS) por artículo, desglosado
          por UbicacionDepositoId (1/2/3) + Total. Paginado server-side: nunca se
          traen los +4mil artículos de un tiro. "Exportar Excel" sí trae el 100%
          del stock, sin paginar.
        </p>
      </main>
    </div>
  );
}
