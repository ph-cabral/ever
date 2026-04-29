"use client";

import { useState, useEffect, useCallback } from "react";
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
    console.error("Error guardando en localStorage:", err);
  }
}

export function useRrhhData() {
  const [data, setData] = useState<RrhhData>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setData(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveToStorage(data);
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
