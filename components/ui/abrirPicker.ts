import type { MouseEvent } from "react";

// ─── abrirPicker — el calendario nativo se abre desde CUALQUIER parte del campo ─
// (2026-09-04) En `<input type="month">` (y `type="date"`) el navegador solo
// despliega el picker cuando se le acierta al iconito del costado, que mide
// ~10 px. Con esto un click en cualquier lugar de la caja lo abre.
//
// Se usa como `onClick={abrirPicker}` en el input, junto con `cursor-pointer`
// en la clase para que se note que toda la caja es clickeable.
//
// `showPicker()` es Chromium 99+ / Firefox 101+ / Safari 16+: si no está, el
// campo sigue funcionando como siempre (el iconito). Va en try/catch porque
// tira si el picker ya está abierto o si el navegador no considera al click un
// gesto válido — en los dos casos no hay nada que hacer y no debe romper la
// vista.
//
// No se aplica a los `type="date"` que se cargan a mano (fecha de arribo en
// /compras/faltantes y /fabrica/faltantes): ahí abrir el calendario solo
// estorba la escritura.
type InputConPicker = HTMLInputElement & { showPicker?: () => void };

export function abrirPicker(e: MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as InputConPicker;
  if (typeof el.showPicker !== "function") return;
  try {
    el.showPicker();
  } catch {
    // ya abierto, o el navegador lo rechaza: sin efecto.
  }
}
