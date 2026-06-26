import { NextResponse } from "next/server";
import type {
  BuscarParams,
  BuscarResponse,
  Fuente,
  Prospecto,
} from "@/lib/buscador/types";
import { buscarGoogle } from "@/lib/buscador/google";
import { buscarMercadoLibre } from "@/lib/buscador/mercadolibre";
import { enriquecer } from "@/lib/buscador/enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Tope duro de la búsqueda (incluye enriquecimiento). El cliente itera provincia
// por provincia, así cada request queda acotado y responde rápido.
const DEADLINE_MS = 55_000;

function parseBody(b: unknown): BuscarParams | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const q = typeof o.q === "string" ? o.q.trim() : "";
  if (!q) return null;
  const provincia =
    typeof o.provincia === "string" && o.provincia ? o.provincia : "todas";
  const fuentesRaw = Array.isArray(o.fuentes)
    ? o.fuentes
    : ["google", "mercadolibre"];
  const fuentes = fuentesRaw.filter(
    (f): f is Fuente => f === "google" || f === "mercadolibre",
  );
  const meses =
    typeof o.meses === "number" && o.meses > 0 ? Math.min(o.meses, 36) : 12;
  return {
    q,
    provincia,
    fuentes: fuentes.length ? fuentes : ["google", "mercadolibre"],
    enriquecer: o.enriquecer !== false,
    meses,
  };
}

function mergeInto(mapa: Map<string, Prospecto>, list: Prospecto[]): void {
  for (const p of list) {
    const ex = mapa.get(p.id);
    if (!ex) {
      mapa.set(p.id, p);
      continue;
    }
    ex.telefono ??= p.telefono;
    ex.whatsapp ??= p.whatsapp;
    ex.email ??= p.email;
    ex.web ??= p.web;
    ex.direccion ??= p.direccion;
    ex.provincia ??= p.provincia;
    ex.localidad ??= p.localidad;
    ex.enlace ??= p.enlace;
    ex.rubro ??= p.rubro;
    if (
      p.precioDesde != null &&
      (ex.precioDesde == null || p.precioDesde < ex.precioDesde)
    ) {
      ex.precioDesde = p.precioDesde;
    }
    if (p.publicaciones != null) {
      ex.publicaciones = (ex.publicaciones ?? 0) + p.publicaciones;
    }
  }
}

function puntaje(p: Prospecto): number {
  return (
    (p.telefono ? 2 : 0) +
    (p.whatsapp ? 2 : 0) +
    (p.email ? 2 : 0) +
    (p.web ? 1 : 0) +
    (p.direccion ? 1 : 0)
  );
}

export async function POST(req: Request) {
  const t0 = Date.now();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const params = parseBody(body);
  if (!params) {
    return NextResponse.json(
      { error: "Falta el artículo a buscar (q)." },
      { status: 400 },
    );
  }

  const warnings: string[] = [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEADLINE_MS);

  try {
    const tareas: Promise<{ prospectos: Prospecto[]; warning?: string }>[] = [];

    if (params.fuentes.includes("google")) {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
      if (!apiKey) {
        warnings.push(
          "Google: falta GOOGLE_PLACES_API_KEY en el .env del server. Fuente omitida.",
        );
      } else {
        tareas.push(
          buscarGoogle({
            q: params.q,
            provincia: params.provincia,
            apiKey,
            signal: ctrl.signal,
          }),
        );
      }
    }

    if (params.fuentes.includes("mercadolibre")) {
      tareas.push(
        buscarMercadoLibre({
          q: params.q,
          provincia: params.provincia,
          signal: ctrl.signal,
        }),
      );
    }

    const resultados = await Promise.all(tareas);
    const mapa = new Map<string, Prospecto>();
    const porFuente: Record<Fuente, number> = { google: 0, mercadolibre: 0 };
    for (const r of resultados) {
      if (r.warning) warnings.push(r.warning);
      for (const p of r.prospectos) porFuente[p.fuente]++;
      mergeInto(mapa, r.prospectos);
    }

    const results = [...mapa.values()];

    let enriquecidos = 0;
    if (params.enriquecer && !ctrl.signal.aborted) {
      enriquecidos = await enriquecer({
        prospectos: results,
        signal: ctrl.signal,
      });
    }

    results.sort(
      (a, b) => puntaje(b) - puntaje(a) || a.nombre.localeCompare(b.nombre),
    );

    const resp: BuscarResponse = {
      results,
      meta: {
        q: params.q,
        provincia: params.provincia,
        total: results.length,
        porFuente,
        enriquecidos,
        ms: Date.now() - t0,
      },
      warnings,
    };
    return NextResponse.json(resp);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Error en la búsqueda: ${msg}` },
      { status: 500 },
    );
  } finally {
    clearTimeout(timer);
  }
}
