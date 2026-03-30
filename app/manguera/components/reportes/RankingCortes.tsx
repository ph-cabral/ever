"use client";

import { useEffect, useState } from "react";

interface RankingItem {
  codigo: string;
  cantidad_cortes: string;
  total_metros: string;
}

export default function RankingCortes() {
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reportes/ranking-cortes")
      .then((res) => res.json())
      .then((data) => {
        setRanking(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (ranking.length === 0) {
    return <p className="text-gray-500 text-center py-4">No hay cortes registrados</p>;
  }

  const totalMetros = ranking.reduce((sum, r) => sum + parseFloat(r.total_metros), 0);
  const totalCortes = ranking.reduce((sum, r) => sum + parseInt(r.cantidad_cortes), 0);

  return (
    <div>
      <div className="flex gap-4 mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-semibold text-blue-800">Total cortado:</span>{" "}
          <span className="text-blue-600">{totalMetros.toFixed(2)} mts</span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-semibold text-green-800">Total cortes:</span>{" "}
          <span className="text-green-600">{totalCortes}</span>
        </div>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left px-4 py-2 border">#</th>
            <th className="text-left px-4 py-2 border">Código</th>
            <th className="text-right px-4 py-2 border">Cortes</th>
            <th className="text-right px-4 py-2 border">Total Metros</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((item, i) => (
            <tr key={item.codigo} className="hover:bg-gray-50">
              <td className="px-4 py-2 border text-gray-500">{i + 1}</td>
              <td className="px-4 py-2 border font-medium">{item.codigo}</td>
              <td className="px-4 py-2 border text-right">{item.cantidad_cortes}</td>
              <td className="px-4 py-2 border text-right font-semibold">
                {parseFloat(item.total_metros).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
