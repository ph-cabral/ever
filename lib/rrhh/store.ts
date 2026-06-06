"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ParsedFile, DetectedFileType } from "./parseXlsx";

export type RrhhData = Partial<Record<DetectedFileType, ParsedFile>>;

const STORAGE_KEY = "everwear_rrhh_data_v1";

function loadFromStorage(): RrhhData {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RrhhData;
  } catch {
    return {};
  }
}

function saveToStorage(data: RrhhData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    // Cuota excedida u otro error: no romper la app.
    console.warn("No se pudo persistir RRHH en localStorage:", err);
  }
}

export function useRrhhData() {
  const [data, setData] = useState<RrhhData>({});
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setData(loadFromStorage());
    setHydrated(true);
  }, []);

  // Guardado debounced: evita serializar todo el dataset en cada cambio en ráfaga.
  useEffect(() => {
    if (!hydrated) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveToStorage(data), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, hydrated]);

  const setFile = useCallback((type: DetectedFileType, file: ParsedFile) => {
    if (type === "desconocido") return;
    setData((prev) => ({ ...prev, [type]: file }));
  }, []);

  const setFiles = useCallback((files: ParsedFile[]) => {
    setData((prev) => {
      const next = { ...prev };
      files.forEach((f) => {
        if (f.type !== "desconocido") next[f.type] = f;
      });
      return next;
    });
  }, []);

  const removeFile = useCallback((type: DetectedFileType) => {
    setData((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setData({});
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { data, setFile, setFiles, removeFile, clearAll, hydrated };
}
