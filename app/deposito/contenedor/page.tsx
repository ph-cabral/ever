"use client";
import { useState, type ReactNode } from "react";
import { Search, Loader2, AlertTriangle, Bot, UserCheck, Package } from "lucide-react";
import { PageTitle, Panel, Table, Tag, fmtNum } from "../components/ui";
import { InicioButton } from "@/components/ui/InicioButton";

// ──────────────────────────────────────────────────────────────────────────────
// Depósito → Contenedor: buscar por TAG y ver info general + contenido actual +
// historial de movimientos WMS, con el usuario REAL detrás de "Anonymous User".
// Caso NACHO (2026-07-14): un contenedor activo puede no tener NINGÚN
// movimiento en KmovContenedor (nunca completó un historial) — la info general
// y el contenido salen del maestro Contenedor / ContenedorItem, no de ahí.
// Caso resuelto 2026-07-13: TAG AGUA_08/AGUA_09 → Kmov 1811457 → Carballo Agustín.
// ──────────────────────────────────────────────────────────────────────────────

interface ContenedorInfo {
  TAG: string | null;
  Registracion: string | null;
  Vencimiento: string | null;
  Estado: number | string | null;
  Ubicacion: string | null;
  Deposito: number | string | null;
  OrdenRecepcion: number | null;
  FechaDesarme: string | null;
  Desarmo: string | null;
  ControlCalidad: number | string | null;
}

interface ItemRow {
  Articulo: string | null;
  Cantidad: number | null;
}

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

interface ContenedorResponse {
  tag: string;
  encontrado: boolean;
  info: ContenedorInfo | null;
  items: ItemRow[];
  historial: MovRow[];
}

const fmtFechaHora = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
};

function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-zinc-100 mt-0.5">{value ?? "—"}</div>
    </div>
  );
}

export default function DepositoContenedorPage() {
  const [tagInput, setTagInput] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [data, setData] = useState<ContenedorResponse | null>(null);
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
        setData(j as ContenedorResponse);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al consultar");
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  const info = data?.info ?? null;
  const items = data?.items ?? [];
  const historial = data?.historial ?? [];

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <InicioButton label="Inicio" iconSize={14} className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors mb-3" />
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <PageTitle
            title="Depósito — Contenedor"
            sub="Info general + contenido actual + historial de movimientos por TAG · usuario real (WMS.Personal) · SQL en vivo"
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
              placeholder="TAG del contenedor, ej. NACHO"
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

        {searched && !loading && !error && data && !data.encontrado && (
          <div className="text-zinc-500 text-sm">
            No existe contenedor con TAG "{tag}" (ni maestro, ni items, ni historial).
          </div>
        )}

        {!loading && data?.encontrado && (
          <>
            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <Package size={14} className="text-yellow-400" /> General
                </span>
              }
              bodyClass="p-4"
              className="mb-4"
            >
              {info ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <InfoField label="TAG" value={info.TAG} />
                  <InfoField label="Registración" value={fmtFechaHora(info.Registracion)} />
                  <InfoField label="Vencimiento" value={fmtFechaHora(info.Vencimiento)} />
                  <InfoField label="Estado" value={info.Estado} />
                  <InfoField label="Ubicación" value={info.Ubicacion} />
                  <InfoField label="Depósito" value={info.Deposito} />
                  <InfoField label="Ord. Recep." value={info.OrdenRecepcion} />
                  <InfoField label="Control Calidad" value={info.ControlCalidad} />
                  <InfoField label="Desarmó" value={info.Desarmo} />
                  <InfoField label="Fecha Desarme" value={fmtFechaHora(info.FechaDesarme)} />
                </div>
              ) : (
                <div className="text-zinc-500 text-sm">
                  Sin maestro de contenedor (solo aparece en historial de movimientos).
                </div>
              )}
            </Panel>

            <Panel title="Items" bodyClass="p-0" className="mb-4">
              <Table<ItemRow>
                cols={[
                  { key: "Articulo", label: "Cód. Artículo" },
                  {
                    key: "Cantidad",
                    label: "Cantidad",
                    num: true,
                    render: (r) => fmtNum(r.Cantidad ?? undefined),
                  },
                ]}
                rows={items}
                max={200}
                empty="Sin items cargados"
              />
            </Panel>

            <Panel title="Historial de Movimientos" bodyClass="p-0" className="mb-4">
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
                rows={historial}
                max={50}
                empty="Sin movimientos registrados para este TAG"
              />
            </Panel>
          </>
        )}

        <p className="text-[11px] text-zinc-600 mt-6 leading-relaxed">
          "General" e "Items" salen del maestro WMS (Contenedor / ContenedorItem) —
          existen aunque el contenedor nunca haya pasado por un movimiento con
          historial. "Usuario Registro" es el que quedó en el header del
          movimiento (WMS.Kmov) — a veces es la cuenta genérica del sistema
          ("User Anonymous"). "Usuario Real" sale de quién ubicó el contenedor
          (WMS.KmovContenedor/KmovReng → WMS.Personal).
        </p>
      </main>
    </div>
  );
}
