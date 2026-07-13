"use client";
import { useState } from "react";
import { Search, Loader2, AlertTriangle, Bot, UserCheck } from "lucide-react";
import { PageTitle, Panel, Table, Tag, fmtNum } from "../components/ui";

// ──────────────────────────────────────────────────────────────────────────────
// Depósito → Contenedor: buscar por TAG y ver el historial de movimientos WMS,
// con el usuario REAL detrás de "Anonymous User" (cuenta genérica del sistema).
// Caso resuelto 2026-07-13: TAG AGUA_08/AGUA_09 → Kmov 1811457 → Carballo Agustín.
// ──────────────────────────────────────────────────────────────────────────────

interface MovRow {
  KmovId: number;
  Momento: string | null;
  Codigo: string | null;
  NroRef: number | null;
  Estado: number | null;
  Ubicacion: string | null;
  MomentoContenedor: string | null;
  UsuarioRegistroNombre: string | null;
  UsuarioRegistroLogin: string | null;
  UsuarioRealNombre: string | null;
  UsuarioRealLogin: string | null;
  Articulo: string | null;
  Cantidad: number | null;
  UsuarioRegistroEsAnonimo: boolean;
}

const fmtFechaHora = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
};

export default function DepositoContenedorPage() {
  const [tagInput, setTagInput] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [rows, setRows] = useState<MovRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const buscar = () => {
    const t = tagInput.trim();
    if (!t) return;
    setTag(t);
    setSearched(true);
    setLoading(true);
    setError(null);
    fetch(`/api/deposito/contenedor?tag=${encodeURIComponent(t)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setRows(j.rows ?? []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al consultar");
        setRows([]);
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <PageTitle
            title="Depósito — Contenedor"
            sub="Historial de movimientos por TAG · usuario real (WMS.Personal), no la cuenta genérica del sistema · SQL en vivo"
          />
        </div>

        <div className="flex items-center gap-2 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              placeholder="TAG del contenedor, ej. AGUA_08"
              className="bg-[#1f1f1f] border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-zinc-100 focus:border-yellow-400 outline-none w-full"
              autoFocus
            />
          </div>
          <button
            onClick={buscar}
            disabled={loading || !tagInput.trim()}
            className="px-4 py-1.5 rounded-lg bg-yellow-400 text-black text-sm font-semibold hover:bg-yellow-300 disabled:opacity-40 transition-colors"
          >
            Buscar
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-300 text-sm mb-3">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3">
            <Loader2 size={14} className="animate-spin" /> Consultando la base…
          </div>
        )}

        {searched && !loading && !error && rows.length === 0 && (
          <div className="text-zinc-500 text-sm">
            Sin movimientos para el TAG “{tag}”.
          </div>
        )}

        {rows.length > 0 && (
          <Panel bodyClass="p-0">
            <Table<MovRow>
              cols={[
                {
                  key: "Momento",
                  label: "Fecha",
                  render: (r) => fmtFechaHora(r.Momento),
                },
                { key: "Codigo", label: "Código" },
                { key: "Ubicacion", label: "Ubicación" },
                { key: "Articulo", label: "Artículo" },
                {
                  key: "Cantidad",
                  label: "Cant.",
                  num: true,
                  render: (r) => fmtNum(r.Cantidad ?? undefined),
                },
                {
                  key: "UsuarioRegistroNombre",
                  label: "Usuario Registro",
                  render: (r) =>
                    r.UsuarioRegistroEsAnonimo ? (
                      <Tag tone="neutral">
                        <span className="inline-flex items-center gap-1">
                          <Bot size={11} /> Sistema (Anonymous)
                        </span>
                      </Tag>
                    ) : (
                      r.UsuarioRegistroNombre || "—"
                    ),
                },
                {
                  key: "UsuarioRealNombre",
                  label: "Usuario Real",
                  render: (r) =>
                    r.UsuarioRealNombre ? (
                      <Tag tone="green">
                        <span className="inline-flex items-center gap-1">
                          <UserCheck size={11} /> {r.UsuarioRealNombre}
                        </span>
                      </Tag>
                    ) : (
                      "—"
                    ),
                },
              ]}
              rows={rows}
              max={50}
              empty={loading ? "Consultando la base…" : "Sin datos"}
            />
          </Panel>
        )}

        <p className="text-[11px] text-zinc-600 mt-6 leading-relaxed">
          “Usuario Registro” es el que quedó en el header del movimiento
          (WMS.Kmov) — a veces es la cuenta genérica del sistema (“User
          Anonymous”, usada por integraciones/automatismos). “Usuario Real” sale
          de quién ubicó el contenedor (WMS.KmovContenedor/KmovReng →
          WMS.Personal), y suele ser la persona real detrás del movimiento.
        </p>
      </main>
    </div>
  );
}
