"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  LayoutDashboard,
  Globe,
  Building2,
  ClipboardList,
  Landmark,
  Wallet,
  TrendingUp,
  Receipt,
  UploadCloud,
  Loader2,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";
import { useFinanzaData } from "@/lib/finanza/store";
import { fmtMes, fmtArs } from "./components/ui";
import {
  CtasCtesTab,
  ComexTab,
  ProveedoresTab,
  ImpuestosTab,
  PrestamosTab,
  CashTab,
  MacroTab,
} from "./components/tabs";
// Única tab que NO sale del Excel: lee las OC de Magnus en vivo (ver
// components/presupuestos.tsx).
import { PresupuestosTab } from "./components/presupuestos";
import { UsuarioActual } from "@/components/auth/UsuarioActual";

const TABS = [
  { id: "ctasctes", label: "Ctas Ctes", icon: LayoutDashboard },
  { id: "comex", label: "Comercio Exterior", icon: Globe },
  { id: "proveedores", label: "Proveedores Nac.", icon: Building2 },
  { id: "presupuestos", label: "Presupuestos", icon: ClipboardList },
  { id: "impuestos", label: "Impuestos & Lab.", icon: Receipt },
  { id: "prestamos", label: "Préstamos", icon: Landmark },
  { id: "cash", label: "Cash Mensual", icon: Wallet },
  { id: "macro", label: "Macro & USD", icon: TrendingUp },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function FinanzaPage() {
  const { data, macro, hydrated, uploading, error, upload, loadMacro, clear } =
    useFinanzaData();
  const [tab, setTab] = useState<TabId>("ctasctes");
  const [dragging, setDragging] = useState(false);
  const dragCount = useRef(0);

  useEffect(() => {
    if (tab === "macro" && !macro) loadMacro();
  }, [tab, macro, loadMacro]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCount.current = 0;
      setDragging(false);
      const f = Array.from(e.dataTransfer.files).find((x) =>
        x.name.match(/\.(xlsx|xls)$/i),
      );
      if (f) upload(f);
    },
    [upload],
  );

  const tcRef =
    macro?.dolares.find((d) => /oficial/i.test(d.nombre))?.venta ?? null;

  return (
    <div
      className="min-h-screen bg-[#111111] text-white relative"
      onDragEnter={(e) => {
        e.preventDefault();
        dragCount.current++;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCount.current--;
        if (dragCount.current <= 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* Overlay de drop global */}
      {dragging && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4 border-2 border-dashed border-yellow-400 rounded-2xl px-16 py-12">
            <UploadCloud size={56} className="text-yellow-400" />
            <p className="text-lg font-semibold text-zinc-100">
              Soltá el Excel para actualizar
            </p>
            <p className="text-sm text-zinc-500">
              Funciona en cualquier pestaña
            </p>
          </div>
        </div>
      )}

      {/* Toast estado */}
      {(uploading || error) && (
        <div className="fixed bottom-6 right-6 z-[110]">
          {uploading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" />{" "}
              Procesando Excel…
            </div>
          )}
          {!uploading && error && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300">
              <AlertTriangle size={16} className="text-red-400" /> {error}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex items-center justify-between px-8 h-16">
        <div className="flex items-center gap-4">
          <InicioButton />
          <span className="font-bold text-yellow-400 text-2xl tracking-wide uppercase">
            EVER WEAR{" "}
            <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="w-px h-7 bg-yellow-400/30" />
          <span className="text-zinc-500 text-sm">Informe Financiero</span>
        </div>
        <div className="flex items-center gap-2">
          {data?.periodo && (
            <span className="text-xs text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5">
              Período:{" "}
              <span className="text-yellow-400 font-semibold">
                {fmtMes(data.periodo.slice(0, 7))}
              </span>
            </span>
          )}
          {tcRef != null && (
            <span className="text-xs text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5">
              TC Ref:{" "}
              <span className="text-yellow-400 font-semibold">
                {fmtArs(tcRef)}
              </span>
            </span>
          )}
          {data && (
            <button
              onClick={clear}
              title="Limpiar datos"
              className="text-zinc-600 hover:text-red-400 transition-colors p-2"
            >
              <Trash2 size={16} />
            </button>
          )}
          <UsuarioActual />
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-[#242424] border-b border-zinc-800 px-8 flex gap-0 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-[3px] whitespace-nowrap transition-all duration-100 ${
              tab === id
                ? "text-yellow-400 border-yellow-400"
                : "text-zinc-500 border-transparent hover:text-zinc-200"
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {/* Contenido */}
      <main className="max-w-[1400px] mx-auto px-8 py-8">
        {!hydrated ? null : !data && tab !== "macro" && tab !== "presupuestos" ? (
          <div className="flex flex-col items-center justify-center py-28 gap-4 text-center">
            <FileSpreadsheet size={48} className="text-zinc-700" />
            <div>
              <p className="text-zinc-400 font-medium">No hay datos cargados</p>
              <p className="text-zinc-600 text-sm mt-1">
                Arrastrá el Excel financiero a cualquier parte de esta sección.
              </p>
            </div>
          </div>
        ) : (
          <>
            {tab === "ctasctes" && data && <CtasCtesTab d={data.ctasctes} />}
            {tab === "comex" && data && <ComexTab d={data.comex} />}
            {tab === "proveedores" && data && (
              <ProveedoresTab d={data.proveedores} />
            )}
            {tab === "presupuestos" && <PresupuestosTab />}
            {tab === "impuestos" && data && <ImpuestosTab d={data.impuestos} />}
            {tab === "prestamos" && data && <PrestamosTab d={data.prestamos} />}
            {tab === "cash" && data && <CashTab d={data.cash} />}
            {tab === "macro" && (
              <MacroTab macro={macro} onRefresh={loadMacro} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
