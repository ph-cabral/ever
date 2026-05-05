"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import type { ParsedFile } from "@/lib/rrhh/parseXlsx";

type Row = Record<string, unknown>;

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function onlyActivos(file: ParsedFile): Row[] {
  const colEstado = file.columns.find((c) =>
    ["ESTADO", "SITUACION", "SITUACIÓN"].some((x) => normalize(c) === normalize(x)),
  );
  const colEmpresa = file.columns.find((c) =>
    ["EMPRESA", "RAZON SOCIAL", "RAZÓN SOCIAL"].some((x) => normalize(c) === normalize(x)),
  );
  return (file.rows as Row[]).filter((r) => {
    if (colEstado && normalize(String(r[colEstado] ?? "")) !== "activo") return false;
    if (colEmpresa && !normalize(String(r[colEmpresa] ?? "")).includes("ever wear")) return false;
    return true;
  });
}

export default function FilteredEmployeesTable({ file }: { file: ParsedFile }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const activos = onlyActivos(file);

  const colsToShow = ["LEGAJO", "NOMBRE", "AREA", "PUESTO", "ESTADO", "EMPRESA", "FECHA DE BAJA"].filter((c) =>
    file.columns.includes(c),
  );

  const filtered = activos.filter((row) =>
    colsToShow.some((col) => String(row[col] ?? "").toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="mt-8 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-yellow-400" />
          <span className="text-sm font-medium text-zinc-200">
            Empleados filtrados (Activos + EVER WEAR)
          </span>
          <span className="text-xs text-zinc-500">({activos.length} registros)</span>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
      </button>

      {open && (
        <div className="p-4 bg-zinc-950/50">
          <div className="mb-3">
            <input
              type="text"
              placeholder="Buscar en filtrados..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-xs bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-1.5 outline-none focus:border-yellow-400"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  {colsToShow.map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-zinc-500 font-medium uppercase">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                    {colsToShow.map((col) => (
                      <td key={col} className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                        {row[col] ? String(row[col]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={colsToShow.length} className="px-3 py-4 text-center text-zinc-600">
                      Sin resultados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Mostrando {filtered.length} de {activos.length} empleados activos de EVER WEAR S.A.
          </p>
        </div>
      )}
    </div>
  );
}