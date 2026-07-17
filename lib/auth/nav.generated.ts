// AUTO-GENERADO por scripts/gen-nav.mjs — NO editar a mano.
// Se regenera en cada dev/build. Escanea app/**/page.tsx.
import type { NavNode } from "./modules";

export const GENERATED_CHILDREN: Record<string, NavNode[]> = {
  "buscador": [],
  "compras": [
    {
      "label": "Faltantes",
      "href": "/compras/faltantes"
    },
    {
      "label": "Métricas",
      "href": "/compras/metricas"
    }
  ],
  "deposito": [
    {
      "label": "Contenedor",
      "href": "/deposito/contenedor"
    },
    {
      "label": "Evaluación",
      "href": "/deposito/evaluacion"
    },
    {
      "label": "Faltantes",
      "href": "/deposito/faltantes",
      "children": [
        {
          "label": "Duplicadas",
          "href": "/deposito/faltantes/duplicadas"
        }
      ]
    },
    {
      "label": "Pedidos",
      "href": "/deposito/pedidos"
    },
    {
      "label": "Stock",
      "href": "/deposito/stock"
    },
    {
      "label": "WMS",
      "href": "/deposito/wms"
    }
  ],
  "fabrica": [
    {
      "label": "Faltantes",
      "href": "/fabrica/faltantes"
    }
  ],
  "finanza": [],
  "manguera": [
    {
      "label": "Corte",
      "href": "/manguera/corte"
    }
  ],
  "picking": [
    {
      "label": "Picker",
      "href": "/picking/picker"
    }
  ],
  "rrhh": [
    {
      "label": "Asistencia",
      "href": "/rrhh/asistencia"
    },
    {
      "label": "Dashboard",
      "href": "/rrhh/dashboard"
    },
    {
      "label": "Legajos",
      "href": "/rrhh/legajos"
    },
    {
      "label": "Relojes",
      "href": "/rrhh/relojes"
    }
  ],
  "sistema": [
    {
      "label": "Edit",
      "href": "/sistema/edit"
    }
  ],
  "sorteo": [
    {
      "label": "Armar",
      "href": "/sorteo/armar"
    }
  ],
  "ventas": [
    {
      "label": "Faltantes",
      "href": "/ventas/faltantes"
    }
  ],
  "vicki": []
};

export const GENERATED_MODULES: { key: string; label: string; href: string }[] = [
  {
    "key": "buscador",
    "label": "Buscador",
    "href": "/buscador"
  },
  {
    "key": "compras",
    "label": "Compras",
    "href": "/compras"
  },
  {
    "key": "deposito",
    "label": "Deposito",
    "href": "/deposito"
  },
  {
    "key": "fabrica",
    "label": "Fabrica",
    "href": "/fabrica"
  },
  {
    "key": "finanza",
    "label": "Finanza",
    "href": "/finanza"
  },
  {
    "key": "manguera",
    "label": "Manguera",
    "href": "/manguera"
  },
  {
    "key": "picking",
    "label": "Picking",
    "href": "/picking"
  },
  {
    "key": "rrhh",
    "label": "RRHH",
    "href": "/rrhh"
  },
  {
    "key": "sistema",
    "label": "Sistema",
    "href": "/sistema"
  },
  {
    "key": "sorteo",
    "label": "Sorteo",
    "href": "/sorteo"
  },
  {
    "key": "ventas",
    "label": "Ventas",
    "href": "/ventas"
  },
  {
    "key": "vicki",
    "label": "Vicki",
    "href": "/vicki"
  }
];
