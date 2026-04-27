"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";
import FileDropZone from "@/rrhh/components/FileDropZone";
import {
  joinSueldosConEmpleados,
  groupBySum,
  groupByCount,
  splitByEstado,
} from "@/lib/rrhh/join";
import { useRrhhData } from "@/lib/rrhh/store";
import {
  joinSueldosConEmpleados,
  groupBySum,
  groupByCount,
  splitByEstado,
} from "@/lib/rrhh/join";
import { parseXlsxFile } from "@/lib/rrhh/Parsexlsx";

// ── Tabs config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "resumen",       label: "Resumen",        icon: LayoutDashboard },
  { id: "headcount",     label: "Headcount",       icon: Users },
  { id: "rotacion",      label: "Rotación",        icon: RefreshCw },
  { id: "ausentismo",    label: "Ausentismo",      icon: CalendarX },
  { id: "nomina",        label: "Nómina",          icon: DollarSign },
  { id: "hs_extras",     label: "Hs. Extra",       icon: Clock },
  { id: "reclutamiento", label: "Reclutamiento",   icon: SearchCheck },
  { id: "capacitacion",  label: "Capacitación",    icon: BookOpen },
  { id: "kpis",          label: "KPIs Custom",     icon: Target },
  { id: "carga",         label: "Carga de Datos",  icon: FolderOpen },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Mapping tipo archivo → tab ────────────────────────────────────────────────

const TYPE_TO_TAB: Record<DetectedFileType, TabId | null> = {
  empleados:   "headcount",
  ausentismos: "ausentismo",
  sueldos:     "nomina",
  hs_extras:   "hs_extras",
  desconocido: null,
};

// ── Estado global de datos ────────────────────────────────────────────────────

export type RrhhData = Partial<Record<DetectedFileType, ParsedFile>>;

// ── Tabla genérica ────────────────────────────────────────────────────────────

function DataTable({ file }: { file: ParsedFile }) {
  const [search, setSearch] = useState("");

  const filtered = file.rows.filter((row) =>
    file.columns.some((col) =>
      String(row[col] ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
        <input
          type="text"
          placeholder="��� Buscar..."
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
              {file.columns.map((col) => (
                <th
                  key={col}
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
  const [data, setData] = useState<RrhhData>({});

  const handleFilesLoaded = useCallback((files: ParsedFile[]) => {
    setData((prev) => {
      const next = { ...prev };
      files.forEach((f) => {
        if (f.type !== "desconocido") next[f.type] = f;
      });
      return next;
    });
  }, []);

  const loadedCount = Object.keys(data).length;

  const renderTabContent = (tab: TabId) => {
    const goToCarga = () => setActiveTab("carga");

    switch (tab) {
      case "carga":
        return (
          <div className="max-w-2xl">
            <div className="mb-6">
              <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide font-condensed">
                Carga de Datos
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                Arrastrá uno o varios archivos Excel. El sistema detecta automáticamente el tipo de datos.
              </p>
            </div>
            <FileDropZone onFilesLoaded={handleFilesLoaded} />

            {loadedCount > 0 && (
              <div className="mt-6 rounded-xl border border-yellow-400/20 bg-yellow-400/5 px-5 py-4">
                <p className="text-yellow-400 text-sm font-semibold mb-2">
                  ✓ {loadedCount} archivo{loadedCount > 1 ? "s" : ""} cargado{loadedCount > 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(data) as DetectedFileType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        const tabId = TYPE_TO_TAB[type];
                        if (tabId) setActiveTab(tabId);
                      }}
                      className="text-xs px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      {data[type]?.fileName} — {data[type]?.rows.length} filas
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "headcount":
        return data.empleados ? (
          <div>
            <div className="mb-5">
              <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">
                Headcount
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                {data.empleados.rows.length} empleados · {data.empleados.fileName}
              </p>
            </div>
            <DataTable file={data.empleados} />
          </div>
        ) : (
          <EmptyState onGoToCarga={goToCarga} />
        );

      case "ausentismo":
        return data.ausentismos ? (
          <div>
            <div className="mb-5">
              <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">
                Ausentismo
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                {data.ausentismos.rows.length} registros · {data.ausentismos.fileName}
              </p>
            </div>
            <DataTable file={data.ausentismos} />
          </div>
        ) : (
          <EmptyState onGoToCarga={goToCarga} />
        );

      case "nomina":
        return data.sueldos ? (
          <div>
            <div className="mb-5">
              <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">
                Nómina / Sueldos
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                {data.sueldos.rows.length} empleados · {data.sueldos.fileName}
              </p>
            </div>
            <DataTable file={data.sueldos} />
          </div>
        ) : (
          <EmptyState onGoToCarga={goToCarga} />
        );

      case "hs_extras":
        return data.hs_extras ? (
          <div>
            <div className="mb-5">
              <h2 className="text-yellow-400 font-bold text-xl uppercase tracking-wide">
                Horas Extra
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                {data.hs_extras.rows.length} registros · {data.hs_extras.fileName}
              </p>
            </div>
            <DataTable file={data.hs_extras} />
          </div>
        ) : (
          <EmptyState onGoToCarga={goToCarga} />
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <Target size={40} className="text-zinc-700" />
            <p className="text-zinc-500 text-sm">Sección en desarrollo</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex items-center justify-between px-8 h-16">
        <div className="flex items-center gap-4">
          <div>
            <span className="font-bold text-yellow-400 text-2xl tracking-wide uppercase">
              EVER WEAR{" "}
              <span className="text-sm tracking-[3px] font-normal">S.A.</span>
            </span>
          </div>
          <div className="w-px h-7 bg-yellow-400/30" />
          <span className="text-zinc-500 text-sm">
            Dashboard de Recursos Humanos — Directorio
          </span>
        </div>

        {loadedCount > 0 && (
          <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5 text-xs text-yellow-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            {loadedCount} fuente{loadedCount > 1 ? "s" : ""} activa{loadedCount > 1 ? "s" : ""}
          </div>
        )}
      </header>

      {/* Tabs */}
      <nav className="bg-[#242424] border-b border-zinc-800 px-8 flex gap-0 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
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
            {/* Badge si tiene datos */}
            {id !== "carga" && id !== "resumen" && id !== "reclutamiento" && id !== "capacitacion" && id !== "kpis" && id !== "rotacion" && (() => {
              const typeMap: Partial<Record<TabId, DetectedFileType>> = {
                headcount: "empleados",
                ausentismo: "ausentismos",
                nomina: "sueldos",
                hs_extras: "hs_extras",
              };
              const type = typeMap[id];
              return type && data[type] ? (
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-0.5" />
              ) : null;
            })()}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto px-8 py-8">
        {renderTabContent(activeTab)}
      </main>
    </div>
  );
}
