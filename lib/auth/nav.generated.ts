// AUTO-GENERADO por scripts/gen-nav.mjs — NO editar a mano.
// Se regenera en cada dev/build. Escanea app/**/page.tsx.
import type { NavNode } from "./modules";

export const GENERATED_CHILDREN: Record<string, NavNode[]> = {
  "manguera": [
    {
      "label": "Corte",
      "href": "/manguera/corte"
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
  "picking": [
    {
      "label": "Picker",
      "href": "/picking/picker"
    }
  ],
  "compras": [
    {
      "label": "Faltantes",
      "href": "/compras/faltantes"
    }
  ],
  "ventas": [
    {
      "label": "Faltantes",
      "href": "/ventas/faltantes"
    }
  ],
  "finanza": [],
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
  "sorteo": [
    {
      "label": "Armar",
      "href": "/sorteo/armar"
    }
  ],
  "vicki": [],
  "buscador": [],
  "sistema": []
};
