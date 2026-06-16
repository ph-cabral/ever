"use client";

import { useState, useEffect, useCallback } from "react";
import type { FinanzaData } from "./parseFinanza";

export interface DolarTipo {
  nombre: string;
  compra: number | null;
  venta: number | null;
}
export interface MacroData {
  fetchedAt: string;
  dolares: DolarTipo[];
  inflacionMensual: number | null;
  inflacionInteranual: number | null;
  plazoFijoTNA: number | null;
  inflacionSerie?: { fecha: string; valor: number }[];
  tcSerie?: { fecha: string; venta: number }[];
}

const KEY = "everwear_finanza_v1";

interface Persisted {
  data: FinanzaData | null;
  macro: MacroData | null;
}

function load(): Persisted {
  if (typeof window === "undefined") return { data: null, macro: null };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Persisted) : { data: null, macro: null };
  } catch {
    return { data: null, macro: null };
  }
}
function save(p: Persisted) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (e) {
    console.error("finanza persist:", e);
  }
}

export function useFinanzaData() {
  const [data, setData] = useState<FinanzaData | null>(null);
  const [macro, setMacro] = useState<MacroData | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = load();
    setData(p.data);
    setMacro(p.macro);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) save({ data, macro });
  }, [data, macro, hydrated]);

  const upload = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError("Archivo no es Excel");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/finanza/parse", {
        method: "POST",
        body: fd,
      });
      if (!res.ok)
        throw new Error(
          ((await res.json().catch(() => ({}))) as { error?: string }).error ||
            `HTTP ${res.status}`,
        );
      setData((await res.json()) as FinanzaData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar");
    } finally {
      setUploading(false);
    }
  }, []);

  const loadMacro = useCallback(async () => {
    try {
      const r = await fetch("/api/finanza/macro");
      if (r.ok) setMacro((await r.json()) as MacroData);
    } catch {
      /* silencioso */
    }
  }, []);

  const clear = useCallback(() => {
    setData(null);
    if (typeof window !== "undefined") {
      const p = load();
      save({ data: null, macro: p.macro });
    }
  }, []);

  return { data, macro, hydrated, uploading, error, upload, loadMacro, clear };
}
