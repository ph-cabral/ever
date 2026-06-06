"use client";

import { useState, useEffect, useCallback } from "react";
import type { DepositoData } from "./parseDeposito";
import type { TiempoData } from "./parseTiempo";

const KEY = "everwear_deposito_v2";

interface Persisted { prod: DepositoData | null; tiempo: TiempoData | null }

function load(): Persisted {
  if (typeof window === "undefined") return { prod: null, tiempo: null };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Persisted) : { prod: null, tiempo: null };
  } catch { return { prod: null, tiempo: null }; }
}
function save(p: Persisted) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { console.error("deposito persist:", e); }
}

export function useDepositoData() {
  const [prod, setProd] = useState<DepositoData | null>(null);
  const [tiempo, setTiempo] = useState<TiempoData | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { const p = load(); setProd(p.prod); setTiempo(p.tiempo); setHydrated(true); }, []);
  useEffect(() => { if (hydrated) save({ prod, tiempo }); }, [prod, tiempo, hydrated]);

  const upload = useCallback(async (file: File) => {
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) { setError("El archivo debe ser .csv o .xlsx"); return; }
    setUploading(true); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/deposito/parse", { method: "POST", body: fd });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || `HTTP ${res.status}`);
      const out = (await res.json()) as { kind: "produccion" | "tiempo"; data: DepositoData | TiempoData };
      if (out.kind === "tiempo") setTiempo(out.data as TiempoData);
      else setProd(out.data as DepositoData);
    } catch (e) { setError(e instanceof Error ? e.message : "Error al procesar"); }
    finally { setUploading(false); }
  }, []);

  const clear = useCallback(() => { setProd(null); setTiempo(null); }, []);

  return { prod, tiempo, hydrated, uploading, error, upload, clear };
}
