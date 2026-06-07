"use client";
import { useState, useRef, useCallback, useMemo } from "react";
import { fmtNum, fmtMes } from "./components/ui";
import {
  ResumenTab,
  ProcesoTab,
  OperariosTab,
  TiempoTab,
  MesSelect,
} from "./components/tabs";
import {
  LayoutDashboard, PackageSearch, Repeat, MapPin, Users, Clock,
  UploadCloud, Loader2, Trash2, FileSpreadsheet, AlertTriangle,
} from "lucide-react";
import { useDepositoData } from "@/lib/deposito/store";

const TABS = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard, needs: "prod" },
  { id: "picking", label: "Picking", icon: PackageSearch, needs: "prod" },
  { id: "librepo", label: "Libre + Reposición", icon: Repeat, needs: "prod" },
  { id: "reub", label: "Re-Ubicación", icon: MapPin, needs: "prod" },
  { id: "operarios", label: "Operarios", icon: Users, needs: "prod" },
  { id: "tiempo", label: "Tiempo de Pedidos", icon: Clock, needs: "tiempo" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function DepositoPage() {
  const { prod, tiempo, hydrated, uploading, error, upload, clear } = useDepositoData();
  const [tab, setTab] = useState<TabId>("resumen");
  const [dragging, setDragging] = useState(false);
  const [mes, setMes] = useState("__all__");
  const mesesAll = useMemo(
    () =>
      [...new Set([...(prod?.meses ?? []), ...(tiempo?.meses ?? [])])].sort(),
    [prod, tiempo],
  );
  const dragCount = useRef(0);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dragCount.current = 0; setDragging(false);
    const f = Array.from(e.dataTransfer.files).find((x) => x.name.match(/\.(csv|xlsx|xls)$/i));
    if (f) upload(f);
  }, [upload]);

  const current = TABS.find((t) => t.id === tab)!;
  const needs = current.needs;
  const ready = needs === "tiempo" ? !!tiempo : !!prod;

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
      {dragging && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4 border-2 border-dashed border-yellow-400 rounded-2xl px-16 py-12">
            <UploadCloud size={56} className="text-yellow-400" />
            <p className="text-lg font-semibold text-zinc-100">
              Soltá el archivo para actualizar
            </p>
            <p className="text-sm text-zinc-500">
              Producción (prod.csv) o Tiempo de Pedidos (.xlsx) — se detecta
              solo
            </p>
          </div>
        </div>
      )}

      {(uploading || error) && (
        <div className="fixed bottom-6 right-6 z-[110]">
          {uploading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" />{" "}
              Procesando archivo…
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
          <span className="font-bold text-yellow-400 text-2xl tracking-wide uppercase">
            EVER WEAR{" "}
            <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="w-px h-7 bg-yellow-400/30" />
          <span className="text-zinc-500 text-sm">
            Depósito · Producción WMS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            {mesesAll.length > 0 && (
              <MesSelect
                meses={["__all__", ...mesesAll]}
                value={mes}
                onChange={setMes}
                nombre={(m) => (m === "__all__" ? "Todos" : fmtMes(m))}
              />
            )}
            {(prod || tiempo) && (
              <button
                onClick={clear}
                title="Limpiar datos"
                className="text-zinc-600 hover:text-red-400 transition-colors p-2"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {/* {prod?.resumen.nombreUltimoMes && (
            <span className="text-xs text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5">
              Prod.:{" "}
              <span className="text-yellow-400 font-semibold">
                {prod.resumen.nombreUltimoMes}
              </span>
            </span>
          )}
          {tiempo?.mesReciente && (
            <span className="text-xs text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5">
              Tiempos:{" "}
              <span className="text-yellow-400 font-semibold">
                {tiempo.mesReciente}
              </span>
            </span>
          )} */}
          {/* {(prod || tiempo) && (
            <button
              onClick={clear}
              title="Limpiar datos"
              className="text-zinc-600 hover:text-red-400 transition-colors p-2"
            >
              <Trash2 size={16} />
            </button>
          )} */}
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
        {!hydrated ? null : !ready ? (
          <div className="flex flex-col items-center justify-center py-28 gap-4 text-center">
            <FileSpreadsheet size={48} className="text-zinc-700" />
            <div>
              <p className="text-zinc-400 font-medium">
                {needs === "tiempo"
                  ? "No hay datos de tiempos cargados"
                  : "No hay datos de producción cargados"}
              </p>
              <p className="text-zinc-600 text-sm mt-1">
                {needs === "tiempo"
                  ? "Arrastrá el Excel «SITD_Tiempo de pedidos.xlsx» a cualquier parte de esta sección."
                  : "Arrastrá el CSV de producción (prod.csv) a cualquier parte de esta sección."}
              </p>
            </div>
          </div>
        ) : (
          <>
            {tab === "resumen" && prod && <ResumenTab d={prod} mes={mes} />}
            {tab === "picking" && prod && (
              <ProcesoTab d={prod} proceso="Picking" mes={mes} />
            )}
            {tab === "librepo" && prod && (
              <ProcesoTab d={prod} proceso="Libre + Reposicion" mes={mes} />
            )}
            {tab === "reub" && prod && (
              <ProcesoTab d={prod} proceso="Re-Ubicacion" mes={mes} />
            )}
            {tab === "operarios" && prod && <OperariosTab d={prod} />}
            {tab === "tiempo" && tiempo && <TiempoTab d={tiempo} mes={mes} />}
          </>
        )}
      </main>
    </div>
  );
}
