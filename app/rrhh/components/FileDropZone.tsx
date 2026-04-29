"use client";

import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, X } from "lucide-react";
import {
  parseXlsxFile,
  type ParsedFile,
  type DetectedFileType,
  FILE_TYPE_LABELS,
} from "@/lib/rrhh/parseXlsx";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FileItem {
  file: File;
  status: "parsing" | "ok" | "error" | "unknown";
  parsed?: ParsedFile;
  error?: string;
}

interface FileDropZoneProps {
  onFilesLoaded: (files: ParsedFile[]) => void;
}

// ── Colores por tipo ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<DetectedFileType, string> = {
  empleados: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  ausentismos: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  sueldos: "text-green-400 bg-green-400/10 border-green-400/30",
  hs_extras: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  desconocido: "text-zinc-500 bg-zinc-500/10 border-zinc-500/30",
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function FileDropZone({ onFilesLoaded }: FileDropZoneProps) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const processFiles = useCallback(
    async (newFiles: File[]) => {
      const xlsxFiles = newFiles.filter((f) =>
        f.name.match(/\.(xlsx|xls)$/i)
      );
      if (xlsxFiles.length === 0) return;

      // Agregar items en estado "parsing"
      const pending: FileItem[] = xlsxFiles.map((f) => ({
        file: f,
        status: "parsing",
      }));

      setItems((prev) => [...prev, ...pending]);

      // Parsear en paralelo
      const results = await Promise.allSettled(
        xlsxFiles.map((f) => parseXlsxFile(f))
      );

      const parsed: ParsedFile[] = [];

      setItems((prev) => {
        const updated = [...prev];
        results.forEach((result, i) => {
          const idx = updated.findIndex(
            (it) => it.file === xlsxFiles[i] && it.status === "parsing"
          );
          if (idx === -1) return;

          if (result.status === "fulfilled") {
            const pf = result.value;
            updated[idx] = {
              ...updated[idx],
              status: pf.type === "desconocido" ? "unknown" : "ok",
              parsed: pf,
            };
            if (pf.type !== "desconocido") parsed.push(pf);
          } else {
            updated[idx] = {
              ...updated[idx],
              status: "error",
              error: "No se pudo leer el archivo",
            };
          }
        });
        return updated;
      });

      if (parsed.length > 0) onFilesLoaded(parsed);
    },
    [onFilesLoaded]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      processFiles(Array.from(e.dataTransfer.files));
    },
    [processFiles]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) processFiles(Array.from(e.target.files));
      e.target.value = "";
    },
    [processFiles]
  );

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearAll = () => setItems([]);

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <label
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-150 p-10
          ${dragging
            ? "border-yellow-400 bg-yellow-400/5"
            : "border-zinc-700 hover:border-yellow-400/60 hover:bg-yellow-400/[0.02]"
          }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          multiple
          accept=".xlsx,.xls"
          className="hidden"
          onChange={onInputChange}
        />
        <Upload
          size={36}
          className={`transition-colors ${dragging ? "text-yellow-400" : "text-zinc-600"}`}
        />
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-300">
            Arrastrá los archivos acá o{" "}
            <span className="text-yellow-400 font-semibold">hacé clic para seleccionar</span>
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            empleados.xlsx · ausentismos.xlsx · pago_de_sueldos.xlsx · hs_extras.xlsx
          </p>
        </div>
      </label>

      {/* Lista de archivos */}
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Archivos cargados
            </span>
            <button
              onClick={clearAll}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Limpiar todo
            </button>
          </div>

          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3"
            >
              <FileSpreadsheet size={18} className="text-zinc-500 shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate font-medium">
                  {item.file.name}
                </p>
                {item.parsed && (
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {item.parsed.rows.length} filas · {item.parsed.columns.length} columnas
                  </p>
                )}
                {item.error && (
                  <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
                )}
              </div>

              {/* Badge de tipo */}
              {item.parsed && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                    TYPE_COLORS[item.parsed.type]
                  }`}
                >
                  {FILE_TYPE_LABELS[item.parsed.type]}
                </span>
              )}

              {/* Estado */}
              <div className="shrink-0">
                {item.status === "parsing" && (
                  <Loader2 size={16} className="text-zinc-500 animate-spin" />
                )}
                {item.status === "ok" && (
                  <CheckCircle size={16} className="text-green-400" />
                )}
                {item.status === "error" && (
                  <XCircle size={16} className="text-red-400" />
                )}
                {item.status === "unknown" && (
                  <XCircle size={16} className="text-zinc-500" />
                )}
              </div>

              <button
                onClick={() => removeItem(idx)}
                className="text-zinc-700 hover:text-zinc-400 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
