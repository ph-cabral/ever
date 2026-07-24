"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, MapPin } from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";

// Artículos con MÁS DE UNA ubicación asignada (rack). Para ir depurando el
// maestro: cada artículo debería tener una sola. Fuente: EVERWEAR.Ubicacion#
// (numéricas con guión; excluye depósito/letras y carro 0002).
interface Row {
  CodArticulo: string;
  Nombre: string;
  Ubicaciones: string[];
  Cantidad: number;
}

export default function DuplicadasPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deposito/faltantes/multi-ubicacion", {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[#111111] text-white p-5">
      <InicioButton label="Inicio" iconSize={14} className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors mb-3" />
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Artículos con +1 ubicación asignada</h1>
          <p className="text-sm text-zinc-500">
            Dejá una sola por artículo. {rows.length} artículos.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-zinc-300 border border-zinc-700 rounded-md px-3 py-1.5 hover:bg-zinc-800"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-zinc-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-zinc-500 py-16 text-center">
          No hay artículos con más de una ubicación asignada.
        </p>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#1A1A1A] text-zinc-400">
              <tr className="text-left">
                <th className="px-3 py-2.5 font-medium">Cód.</th>
                <th className="px-3 py-2.5 font-medium">Nombre</th>
                <th className="px-3 py-2.5 font-medium text-center">#</th>
                <th className="px-3 py-2.5 font-medium">Ubicaciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.CodArticulo} className="border-t border-zinc-800/60">
                  <td className="px-3 py-2 font-mono text-zinc-300">
                    {r.CodArticulo}
                  </td>
                  <td className="px-3 py-2 text-zinc-100">{r.Nombre}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-yellow-400">
                    {r.Cantidad}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {r.Ubicaciones.map((u) => (
                        <span
                          key={u}
                          className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-zinc-200"
                        >
                          <MapPin size={11} className="text-zinc-500" />
                          {u}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
