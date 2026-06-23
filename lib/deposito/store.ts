"use client";

import { useState, useEffect, useCallback } from "react";
import { parseDepositoRows, type DepositoData } from "./parseDeposito";
import { parseTiempo, type TiempoData } from "./parseTiempo";

interface ApiResp {
  rows?: Record<string, unknown>[];
  error?: string;
}

// Trae los datos de /deposito EN VIVO desde SQL Server (vía indicadores-api):
//  - Productividad WMS filtrada por rango [desde, hasta] (en SQL)
//  - Tiempo de Pedidos (tabla TMP), filtrada por el mismo rango (en cliente)
// El filtro por operario se aplica en el cliente (ver page.tsx) para no re-consultar.
export function useDepositoData(desde: string, hasta: string) {
  const [prod, setProd] = useState<DepositoData | null>(null);
  const [tiempo, setTiempo] = useState<TiempoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    setError(null);
    const errs: string[] = [];

    try {
      const r = await fetch(`/api/deposito/wms?desde=${desde}&hasta=${hasta}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as ApiResp;
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setProd(parseDepositoRows(j.rows ?? [], "WMS en vivo"));
    } catch (e) {
      errs.push("Productividad: " + (e instanceof Error ? e.message : "error"));
    }

    try {
      const r = await fetch(`/api/deposito/tiempo`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as ApiResp;
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setTiempo(parseTiempo(j.rows ?? [], "Tiempo en vivo", { desde, hasta }));
    } catch (e) {
      errs.push("Tiempo: " + (e instanceof Error ? e.message : "error"));
    }

    setError(errs.length ? errs.join(" · ") : null);
    setLoading(false);
  }, [desde, hasta]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { prod, tiempo, loading, error, reload };
}
