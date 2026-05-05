"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Table2 } from "lucide-react";
import type { ParsedFile } from "@/lib/rrhh/parseXlsx";

type Props = {
  file: ParsedFile;
  /** Render prop para no acoplar a DataTable: la página le pasa cómo renderizar la tabla. */
  renderTable: (file: ParsedFile) => React.ReactNode;
  defaultOpen?: boolean;
};

export default function CollapsibleTable({ file, renderTable, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-900/60 hover:bg-zinc-900 transition-colors text-left"
      >
        {open ? <ChevronDown size={16} className="text-zinc-500" /> : <ChevronRight size={16} className="text-zinc-500" />}
        <Table2 size={15} className="text-zinc-500" />
        <span className="text-sm font-medium text-zinc-300">Datos en bruto</span>
        <span className="text-xs text-zinc-600 ml-auto">
          {file.rows.length} filas · {file.columns.length} columnas
        </span>
      </button>
      {open && <div className="border-t border-zinc-800">{renderTable(file)}</div>}
    </div>
  );
}
