"use client";

import { useState } from "react";
import Link from "next/link";

type Trabajo = {
  id: number;
  ordenTrabajo: string | null;
  fechaPedido: string | Date;
  producto: string | null;
  estado: string;
  legajo: { nombre: string } | null;
  sector: { nombre: string } | null;
  cliente: { nombre: string } | null;
  _count: { cortes: number };
};

export function TrabajosClient({ trabajos }: { trabajos: Trabajo[] }) {
  const [filtro, setFiltro] = useState("");
  const f = filtro.toLowerCase();
  const filtrados = trabajos.filter(
    (t) =>
      (t.ordenTrabajo || "").toLowerCase().includes(f) ||
      (t.producto || "").toLowerCase().includes(f) ||
      (t.legajo?.nombre || "").toLowerCase().includes(f) ||
      (t.cliente?.nombre || "").toLowerCase().includes(f),
  );
  const fmt = (d: string | Date) => new Date(d).toLocaleDateString("es-AR");

  const cols = ["OT n°", "Fecha", "Operario", "Sector", "Cliente", "Producto", "N° cortes", "Estado"];

  return (
    <main className="container mx-auto p-4">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Trabajos</h1>
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <div className="relative w-full lg:w-72">
            <input
              type="text"
              placeholder="Buscar OT, producto, operario, cliente..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
            {filtro && (
              <button
                onClick={() => setFiltro("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
          <Link
            href="/manguera/corte/nuevo"
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            + Crear trabajo
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {cols.map((h) => (
                <th
                  key={h}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-6 py-4 text-left text-gray-500">
                  Sin trabajos
                </td>
              </tr>
            ) : (
              filtrados.map((t) => (
                <tr key={t.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-left font-medium text-gray-900">
                    {t.ordenTrabajo || `#${t.id}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-left text-gray-900">{fmt(t.fechaPedido)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-left text-gray-900">{t.legajo?.nombre || "-"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-left text-gray-900">{t.sector?.nombre || "-"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-left text-gray-900">{t.cliente?.nombre || "-"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-left text-gray-900">{t.producto || "-"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-left text-gray-900">{t._count.cortes}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-left">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {t.estado}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}