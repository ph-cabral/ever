// ──────────────────────────────────────────────────────────────────────────────
// Clasificación de origen del artículo (Nacionales / Importados / Fábrica /
// Otros), compartida por /compras/faltantes y /fabrica/faltantes para que las
// vistas particionen el MISMO universo sin superponerse ni perder filas.
//
// Fuente: r.tipoArticulo = Magnus StkFer_Articulos.NacionalImportado →
// Stk_TiposArticulos.Descripcion (dato real por artículo). Valores observados:
// "Nacional", "Importado", "Original", "Fabril" — este último llega como
// "Fabrica" desde /deposito/faltantes (indicadores-api/deposito.py lo renombra),
// por eso se aceptan las dos formas.
//
// NO se usa r.importacion (heurística por fecha de OC pactada: clasificaba mal
// proveedores chinos con fecha cargada como "Nacional"); esa heurística sigue
// intacta para /compras/metricas.
//
// Reparto:
//   fabrica    → tipo Fabril/Fabrica, o proveedor EVER WEAR S.A. INDUSTRIAL.
//                Solo se ve en /fabrica/faltantes.
//   nacionales → tipo Nacional u Original (lado "Nacionales" del botón).
//   importados → tipo Importado (lado "Importados" del botón).
//   otros      → sin tipo cargado o tipo desconocido. Antes caían en
//                "importados" por default y ensuciaban ese lado; ahora tienen
//                su propia solapa para que nada quede fuera de la vista.
// ──────────────────────────────────────────────────────────────────────────────

export type OrigenArticulo = "nacionales" | "importados" | "fabrica" | "otros";

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
  // El tipo manda sobre el proveedor: un artículo Fabril comprado a un tercero
  // sigue siendo de fábrica y se trabaja en /fabrica/faltantes.
  if (tipo === "fabril" || tipo === "fabrica") return "fabrica";
  if (esProveedorFabrica(r.Proveedor)) return "fabrica";
  if (tipo === "nacional" || tipo === "original") return "nacionales";
  if (tipo === "importado") return "importados";
  return "otros";
}
