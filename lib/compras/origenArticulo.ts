// ──────────────────────────────────────────────────────────────────────────────
// Clasificación de origen del artículo (Nacionales / Importados / Fábrica /
// Otros), compartida por /compras/faltantes y /fabrica/faltantes para que las
// vistas particionen el MISMO universo sin superponerse ni perder filas.
//
// Fuente: r.tipoArticulo = Magnus StkFer_Articulos.NacionalImportado →
// Stk_TiposArticulos.Descripcion (dato real por artículo). Valores observados:
// "Nacional", "Importado", "Original", "Fabril" — el último llega como
// "Fabrica" desde /deposito/faltantes (indicadores-api/deposito.py lo renombra),
// por eso se aceptan las dos formas.
//
// NO se usa r.importacion (heurística por fecha de OC pactada: clasificaba mal
// proveedores chinos con fecha cargada como "Nacional"); esa heurística sigue
// intacta para /compras/metricas.
//
// Reparto:
//   fabrica    → tipo Fabril/Fabrica. El proveedor EVER WEAR S.A. INDUSTRIAL
//                solo manda cuando el artículo NO tiene tipo cargado (o el
//                tipo es desconocido): desde 2026-09-03 el tipo decide
//                SIEMPRE, así que un artículo de tipo Nacional comprado a
//                EVER WEAR (merchandising: FAJAANCHA, FAJAANGOSTA) es
//                nacional y lo trabaja compras, no fábrica.
//                Solo se ve en /fabrica/faltantes.
//   nacionales → tipo Nacional (lado "Nacionales" del botón).
//   importados → tipo Importado (lado "Importados" del botón).
//   original   → tipo Original. NO se muestra en ninguna vista de faltantes
//                (2026-09-01): queda clasificado aparte, no mezclado en
//                "otros", para poder volver a mostrarlo con una línea si
//                alguna vez hace falta.
//   otros      → sin tipo cargado o tipo desconocido. Antes caían en
//                "importados" por default y ensuciaban ese lado; ahora tienen
//                su propia solapa para que nada quede fuera de la vista.
// ──────────────────────────────────────────────────────────────────────────────

export type OrigenArticulo =
  | "nacionales"
  | "importados"
  | "fabrica"
  | "original"
  | "otros";

export interface ArticuloOrigen {
  Proveedor: string | null;
  tipoArticulo?: string | null;
}

const PROVEEDOR_FABRICA = "ever wear s.a. industrial";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .trim();

export const esProveedorFabrica = (p: string | null) =>
  !!p && norm(p).includes(PROVEEDOR_FABRICA);

export function origenArticulo(r: ArticuloOrigen): OrigenArticulo {
  const tipo = norm(r.tipoArticulo || "");
  // El TIPO manda siempre, en las dos direcciones:
  //  · un artículo Fabril comprado a un tercero sigue siendo de fábrica;
  //  · un artículo Nacional/Importado/Original comprado a EVER WEAR S.A.
  //    INDUSTRIAL sigue siendo de compras (2026-09-03: eran los 2 de
  //    merchandising que faltaban en el lado Nacionales — el reporte del mes
  //    da 405 nacionales en agosto 2026 y la vista daba 403).
  if (tipo === "fabril" || tipo === "fabrica") return "fabrica";
  if (tipo === "original") return "original";
  if (tipo === "nacional") return "nacionales";
  if (tipo === "importado") return "importados";
  // Sin tipo cargado (o tipo desconocido): recién acá decide el proveedor, así
  // lo de producción interna no se cuela en compras por no tener tipo.
  if (esProveedorFabrica(r.Proveedor)) return "fabrica";
  return "otros";
}
