"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  RefreshCw,
  CalendarX,
  DollarSign,
  SearchCheck,
  BookOpen,
  Target,
  FolderOpen,
  Clock,
  Trash2,
} from "lucide-react";
import FileDropZone from "@/app/rrhh/components/FileDropZone";
import CollapsibleTable from "@/app/rrhh/components/CollapsibleTable";
import HeadcountTab from "@/app/rrhh/components/tabs/HeadcountTab";
import NominaTab from "@/app/rrhh/components/tabs/NominaTab";
import AusentismoTab from "@/app/rrhh/components/tabs/AusentismoTab";
import HsExtrasTab from "@/app/rrhh/components/tabs/HsExtrasTab";
import ResumenTab from "@/app/rrhh/components/tabs/ResumenTab";
import { useRrhhData } from "@/lib/rrhh/store";
import type { ParsedFile, DetectedFileType } from "@/lib/rrhh/parseXlsx";

// ── Tabs config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard },
  { id: "headcount", label: "Empleados", icon: Users },
  { id: "nomina", label: "Nómina", icon: DollarSign },
  { id: "ausentismo", label: "Ausentismo", icon: CalendarX },
  { id: "hs_extras", label: "Hs. Extra", icon: Clock },
  { id: "rotacion", label: "Rotación", icon: RefreshCw },
  { id: "reclutamiento", label: "Reclutamiento", icon: SearchCheck },
  { id: "capacitacion", label: "Capacitación", icon: BookOpen },
  { id: "kpis", label: "KPIs Custom", icon: Target },
  { id: "carga", label: "Carga de Datos", icon: FolderOpen },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TYPE_TO_TAB: Record<DetectedFileType, TabId | null> = {
  empleados: "headcount",
  ausentismos: "ausentismo",
  sueldos: "nomina",
  hs_extras: "hs_extras",
  desconocido: null,
};

const TAB_TO_TYPE: Partial<Record<TabId, DetectedFileType>> = {
  headcount: "empleados",
  ausentismo: "ausentismos",
  nomina: "sueldos",
  hs_extras: "hs_extras",
};

const TAB_TITLES: Record<DetectedFileType, string> = {
  empleados: "Empleados",
  ausentismos: "Ausentismo",
  sueldos: "Nómina / Sueldos",
  hs_extras: "Horas Extra",
  desconocido: "",
};

// ── Tabla genérica ────────────────────────────────────────────────────────────

function DataTable({ file }: { file: ParsedFile }) {
  const [search, setSearch] = useState("");

  const filtered = file.rows.filter((row) =>
    file.columns.some((col) =>
      String(row[col] ?? "")
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
  );

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-yellow-400 w-56 transition-colors"
        />
        <span className="text-xs text-zinc-600 ml-auto">
          {filtered.length} de {file.rows.length} filas
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900/80">
              {/* {file.columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap border-b border-zinc-800"
                >
                  {col}
                </th>
              ))}
               */}
              {file.columns.map((col, index) => (
                <th
                  key={`${col}-${index}`}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap border-b border-zinc-800"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((row, i) => (
              <tr
                key={i}
                className="border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors"
              >
                {file.columns.map((col) => (
                  <td
                    key={col}
                    className="px-4 py-2.5 text-zinc-300 whitespace-nowrap"
                  >
                    {row[col] !== null && row[col] !== undefined
                      ? String(row[col])
                      : "—"}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={file.columns.length}
                  className="px-4 py-8 text-center text-zinc-600 text-sm"
                >
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 100 && (
        <div className="px-4 py-2 text-xs text-zinc-600 border-t border-zinc-800">
          Mostrando primeras 100 filas de {filtered.length}
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onGoToCarga }: { onGoToCarga: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <FolderOpen size={48} className="text-zinc-700" />
      <div>
        <p className="text-zinc-400 font-medium">No hay datos cargados</p>
        <p className="text-zinc-600 text-sm mt-1">
          Cargá el archivo Excel correspondiente en la pestaña{" "}
          <button
            onClick={onGoToCarga}
            className="text-yellow-400 hover:underline"
          >
            Carga de Datos
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function RrhhDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("carga");
  const { data, setFiles, removeFile, clearAll, hydrated } = useRrhhData();

  const loadedCount = Object.keys(data).length;

  const renderTabContent = (tab: TabId) => {
    const goToCarga = () => setActiveTab("carga");

    // ── Carga de datos ──────────────────────────────────────────────────────
    if (tab === "carga") {
      return (
        <div className="max-w-2xl">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">
                Carga de Datos
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                Arrastrá uno o varios archivos Excel. El sistema detecta
                automáticamente el tipo.
              </p>
            </div>
            {loadedCount > 0 && (
              <button
                onClick={() => {
                  if (confirm("¿Borrar todos los datos cargados?")) clearAll();
                }}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 size={14} />
                Limpiar todo
              </button>
            )}
          </div>

          <FileDropZone onFilesLoaded={setFiles} />

          {loadedCount > 0 && (
            <div className="mt-6 rounded-xl border border-yellow-400/20 bg-yellow-400/5 px-5 py-4">
              <p className="text-yellow-400 text-sm font-semibold mb-3">
                ✓ {loadedCount} fuente{loadedCount > 1 ? "s" : ""} persistida
                {loadedCount > 1 ? "s" : ""} en navegador
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(data) as DetectedFileType[]).map((type) => {
                  const f = data[type];
                  if (!f) return null;
                  return (
                    <div
                      key={type}
                      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-300"
                    >
                      <button
                        onClick={() => {
                          const tabId = TYPE_TO_TAB[type];
                          if (tabId) setActiveTab(tabId);
                        }}
                        className="hover:text-yellow-400 transition-colors"
                      >
                        {f.fileName} — {f.rows.length} filas
                      </button>
                      <button
                        onClick={() => removeFile(type)}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                        title="Quitar"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── Resumen ─────────────────────────────────────────────────────────────
    if (tab === "resumen") {
      return <ResumenTab data={data} onGoToCarga={goToCarga} />;
    }

    // ── Tabs con datos: gráficos + tabla colapsable ─────────────────────────
    const type = TAB_TO_TYPE[tab];
    if (type && data[type]) {
      const f = data[type]!;
      return (
        <div>
          <div className="mb-5">
            <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">
              {TAB_TITLES[type]}
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              {f.rows.length} registros · {f.fileName}
            </p>
          </div>

          <div className="space-y-6">
            {type === "empleados" && <HeadcountTab file={f} />}
            {type === "sueldos" &&
              (data.empleados ? (
                <NominaTab file={f} fileEmpleados={data.empleados} />
              ) : (
                <p className="text-zinc-500 text-sm">
                  Cargá también el archivo de empleados para ver el costo por
                  área.
                </p>
              ))}
            {type === "ausentismos" && <AusentismoTab file={f} />}
            {type === "hs_extras" && <HsExtrasTab file={f} />}

            <CollapsibleTable
              file={f}
              renderTable={(file) => <DataTable file={file} />}
            />
          </div>
        </div>
      );
    }

    if (type) return <EmptyState onGoToCarga={goToCarga} />;

    // ── Tabs en desarrollo ──────────────────────────────────────────────────
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <Target size={40} className="text-zinc-700" />
        <p className="text-zinc-500 text-sm">Sección en desarrollo</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex items-center justify-between px-8 h-16">
        <div className="flex items-center gap-4">
          <span className="font-bold text-yellow-400 text-2xl tracking-wide uppercase">
            EVER WEAR{" "}
            <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="w-px h-7 bg-yellow-400/30" />
          <span className="text-zinc-500 text-sm">
            Dashboard de Recursos Humanos — Directorio
          </span>
        </div>

        {hydrated && loadedCount > 0 && (
          <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5 text-xs text-yellow-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            {loadedCount} fuente{loadedCount > 1 ? "s" : ""} activa
            {loadedCount > 1 ? "s" : ""}
          </div>
        )}
      </header>

      <nav className="bg-[#242424] border-b border-zinc-800 px-8 flex gap-0 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => {
          const type = TAB_TO_TYPE[id];
          const hasData = type && data[type];
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-[3px] whitespace-nowrap transition-all duration-100 ${
                activeTab === id
                  ? "text-yellow-400 border-yellow-400"
                  : "text-zinc-500 border-transparent hover:text-zinc-200"
              }`}
            >
              <Icon size={15} />
              {label}
              {hasData && (
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-0.5" />
              )}
            </button>
          );
        })}
      </nav>

      <main className="max-w-[1400px] mx-auto px-8 py-8">
        {renderTabContent(activeTab)}
      </main>
    </div>
  );
}
