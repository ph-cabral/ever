"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, PackageCheck,
  Check, X, RotateCw, Download, Trash2, Copy,
} from "lucide-react";
import { exportarFaltantesVentas } from "@/lib/ventas/exportFaltantes";

// ──────────────────────────────────────────────────────────────────────────────
// /ventas/faltantes — "Tabla 1" (según diagrama del usuario).
//
//   Entra a esta tabla un renglón "sin existencia" (gate de depósito, sin
//   tocarlo) si:
//     · YA tiene fecha de arribo cargada (preparado.faltante_control), o
//     · compras lo marcó "extraordinario" (preparado.faltante_extraordinario,
//       por código de artículo — tabla de COMPRAS, no se toca ni se escribe
//       acá, solo se lee).
//
//   Se agrupa por Cliente + Factura/Pedido (NroPedOrigen — hoy no hay N° de
//   factura real vinculado al pedido en el pipeline). Extraordinarios arriba
//   con fondo rojo, el resto abajo. Sin acordeones.
//
//   Acción (✓ lo quiere / ✗ no lo quiere): CUALQUIERA de las dos respuestas
//   guarda la decisión y RETIRA la fila de esta tabla (optimista).
//
//   Toda la agregación (existencia + fecha de arribo + extraordinario de
//   compras) se resuelve en el backend: GET /api/ventas/faltantes.
//
//   Toggle "Ingresados" (header, flipped=true): misma lista de arriba,
//   filtrada a los que YA tienen fechaArribo (gruposConArribo, vendidoMode).
//   Acción (✓ vendido / ✗ no vendido): cualquiera de las dos respuestas
//   guarda "vendido" en faltante_control y retira la fila (optimista).
//   Acá también vive el botón basurero (violeta): "irrelevante" descarta el
//   renglón sin pasar por vendido/no vendido — guarda irrelevante=true y
//   retira la fila. Solo en "Ingresados", no en la vista default ni en
//   "Listos para vender" (rows→listos, requiere remito de ingreso x OC).
// ──────────────────────────────────────────────────────────────────────────────

interface Item {
  NroPedOrigen: number;
  NroRengOrigen: number;
  CodArticulo: string;
  Nombre: string;
  CantPend: number;
  Cliente: number | string | null;
  ClienteNombre: string | null;
  Importe: number;
  Fecha: string | null; // fecha del faltante (snapshot Ven_PedRenPendientes)
  fechaArribo: string | null;
  arriboOC: boolean; // true = fecha derivada de la OC pendiente (no cargada a mano)
  extraordinario: boolean; // leído de preparado.faltante_extraordinario (compras)
  extraordinarioFecha: string | null; // clave (fecha, CodArticulo) para decidir comprar
}

// Forma propia (no extiende Item): "listos" no trae extraordinario/extraordinarioFecha.
interface ItemListo {
  NroPedOrigen: number;
  NroRengOrigen: number;
  CodArticulo: string;
  Nombre: string;
  CantPend: number;
  Cliente: number | string | null;
  ClienteNombre: string | null;
  Importe: number;
  Fecha: string | null;
  fechaArribo: string | null;
  clienteQuiere: boolean | null;
  vendido: boolean | null;
  yaIngreso: boolean; // CodArticulo con remito de ingreso x OC ya concretado
}

const keyOf = (it: { NroPedOrigen: number; NroRengOrigen: number }) =>
  `${it.NroPedOrigen}-${it.NroRengOrigen}`;
const grupoKeyOf = (it: { Cliente: number | string | null; NroPedOrigen: number }) =>
  `${it.Cliente}__${it.NroPedOrigen}`;
const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtAr = (s: string | null) => {
  if (s === "EN_STOCK") return "En stock";
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "—";
};

interface Grupo {
  key: string;
  cliente: number | string | null;
  clienteNombre: string | null;
  pedido: number;
  items: Item[];
  importe: number;
}

function agrupar(items: Item[]): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const it of items) {
    const k = grupoKeyOf(it);
    let g = m.get(k);
    if (!g) {
      g = {
        key: k,
        cliente: it.Cliente,
        clienteNombre: it.ClienteNombre,
        pedido: it.NroPedOrigen,
        items: [],
        importe: 0,
      };
      m.set(k, g);
    }
    g.items.push(it);
    g.importe += it.Importe || 0;
    if (!g.clienteNombre && it.ClienteNombre) g.clienteNombre = it.ClienteNombre;
  }
  return [...m.values()]
    .map((g) => ({ ...g, items: [...g.items].sort((x, y) => y.Importe - x.Importe) }))
    .sort((a, b) => b.importe - a.importe);
}

interface GrupoListo {
  key: string;
  cliente: number | string | null;
  clienteNombre: string | null;
  pedido: number;
  items: ItemListo[];
  importe: number;
}

function agruparListos(items: ItemListo[]): GrupoListo[] {
  const m = new Map<string, GrupoListo>();
  for (const it of items) {
    const k = grupoKeyOf(it);
    let g = m.get(k);
    if (!g) {
      g = {
        key: k,
        cliente: it.Cliente,
        clienteNombre: it.ClienteNombre,
        pedido: it.NroPedOrigen,
        items: [],
        importe: 0,
      };
      m.set(k, g);
    }
    g.items.push(it);
    g.importe += it.Importe || 0;
    if (!g.clienteNombre && it.ClienteNombre) g.clienteNombre = it.ClienteNombre;
  }
  return [...m.values()]
    .map((g) => ({ ...g, items: [...g.items].sort((x, y) => y.Importe - x.Importe) }))
    .sort((a, b) => b.importe - a.importe);
}

export default function VentasFaltantesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [listos, setListos] = useState<ItemListo[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false); // header: foco solo extraordinarios
  const [leaving, setLeaving] = useState<Record<string, "left" | "right">>({}); // filas saliendo (animación)

  // Anima las filas (una o varias, ej. extraordinario = todo el artículo) hacia
  // el costado y recién al terminar ejecuta el cambio real — la fila ya está
  // afuera cuando desaparece del array, sin salto de layout.
  const EXIT_MS = 260;
  const withExit = useCallback((keys: string[], dir: "left" | "right", fn: () => void) => {
    setLeaving((m) => {
      const n = { ...m };
      for (const k of keys) n[k] = dir;
      return n;
    });
    window.setTimeout(() => {
      fn();
      setLeaving((m) => {
        const n = { ...m };
        for (const k of keys) delete n[k];
        return n;
      });
    }, EXIT_MS);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ventas/faltantes", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setItems(j.rows ?? []);
      setListos(j.listos ?? []);
      setFecha(j.fecha ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setItems([]);
      setListos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh cada 1 min.
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Guarda clienteQuiere en preparado.faltante_control (mismo endpoint que ya
  // usa /deposito/faltantes/control) y retira la fila de esta tabla, sea cual
  // sea la respuesta. Optimista: si falla el guardado, se vuelve a traer todo.
  //
  // Si el renglón es extraordinario, esta misma respuesta decide también
  // "comprar" en preparado.faltante_extraordinario (a nivel artículo+día, no
  // por renglón) → saca de acá, ya mismo, a TODOS los renglones de ese mismo
  // artículo (no solo el clickeado), porque la decisión es a nivel artículo.
  const decidir = useCallback(
    (it: Item, quiere: boolean) => {
      const keys = items
        .filter((r) =>
          it.extraordinario && r.CodArticulo === it.CodArticulo
            ? true
            : keyOf(r) === keyOf(it),
        )
        .map(keyOf);
      withExit(keys, quiere ? "right" : "left", () => {
        setItems((rs) =>
          rs.filter((r) =>
            it.extraordinario && r.CodArticulo === it.CodArticulo
              ? false
              : keyOf(r) !== keyOf(it),
          ),
        );
        const calls = [
          fetch("/api/deposito/faltantes/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fecha,
              nroPedOrigen: it.NroPedOrigen,
              nroRengOrigen: it.NroRengOrigen,
              codArticulo: it.CodArticulo,
              fechaArribo: it.fechaArribo === "EN_STOCK" ? null : it.fechaArribo,
              clienteQuiere: quiere,
            }),
          }),
        ];
        if (it.extraordinario && it.extraordinarioFecha) {
          calls.push(
            fetch("/api/compras/faltantes-extraordinario", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fecha: it.extraordinarioFecha,
                codArticulo: it.CodArticulo,
                extraordinario: true,
                comprar: quiere,
              }),
            }),
          );
        }
        Promise.all(calls)
          .then((rs) => {
            if (rs.some((r) => !r.ok)) throw new Error();
          })
          .catch(() => {
            setError("No se pudo guardar la decisión");
            load();
          });
      });
    },
    [items, fecha, load, withExit],
  );

  // Tabla 2: guarda "vendido" en preparado.faltante_control (mismo endpoint,
  // ahora acepta ese campo opcional — ver route.ts) y retira la fila, sea cual
  // sea la respuesta (vendido o no vendido). Optimista, igual que decidir().
  // Tabla 1 con fecha de arribo, vista "Ingresados": misma acción que
  // decidirVendido pero sobre un Item (Tabla 1). Fija clienteQuiere=vendido
  // para que el renglón deje de calificar en Tabla 1 al recargar.
  const decidirVendidoTabla1 = useCallback(
    (it: Item, vendido: boolean) => {
      withExit([keyOf(it)], vendido ? "right" : "left", () => {
        setItems((rs) => rs.filter((r) => keyOf(r) !== keyOf(it)));
        fetch("/api/deposito/faltantes/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha,
            nroPedOrigen: it.NroPedOrigen,
            nroRengOrigen: it.NroRengOrigen,
            codArticulo: it.CodArticulo,
            fechaArribo: it.fechaArribo === "EN_STOCK" ? null : it.fechaArribo,
            clienteQuiere: vendido,
            vendido,
          }),
        })
          .then((r) => {
            if (!r.ok) throw new Error();
          })
          .catch(() => {
            setError("No se pudo guardar la venta");
            load();
          });
      });
    },
    [fecha, load, withExit],
  );

  const decidirVendido = useCallback(
    (it: ItemListo, vendido: boolean) => {
      withExit([keyOf(it)], vendido ? "right" : "left", () => {
        setListos((rs) => rs.filter((r) => keyOf(r) !== keyOf(it)));
        fetch("/api/deposito/faltantes/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha,
            nroPedOrigen: it.NroPedOrigen,
            nroRengOrigen: it.NroRengOrigen,
            codArticulo: it.CodArticulo,
            fechaArribo: it.fechaArribo,
            clienteQuiere: it.clienteQuiere,
            vendido,
          }),
        })
          .then((r) => {
            if (!r.ok) throw new Error();
          })
          .catch(() => {
            setError("No se pudo guardar la venta");
            load();
          });
      });
    },
    [fecha, load, withExit],
  );

  // Botón basurero (Tabla 1, SOLO filas "En stock" — existencia=true, error
  // de preparado): "irrelevante", descarta el renglón sin pasar por
  // lo-quiere/no-lo-quiere. Guarda irrelevante=true y retira la fila.
  const marcarIrrelevante = useCallback(
    (it: Item) => {
      withExit([keyOf(it)], "left", () => {
        setItems((rs) => rs.filter((r) => keyOf(r) !== keyOf(it)));
        fetch("/api/deposito/faltantes/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha,
            nroPedOrigen: it.NroPedOrigen,
            nroRengOrigen: it.NroRengOrigen,
            codArticulo: it.CodArticulo,
            fechaArribo: it.fechaArribo === "EN_STOCK" ? null : it.fechaArribo,
            clienteQuiere: null,
            irrelevante: true,
          }),
        })
          .then((r) => {
            if (!r.ok) throw new Error();
          })
          .catch(() => {
            setError("No se pudo marcar como irrelevante");
            load();
          });
      });
    },
    [fecha, load, withExit],
  );

  // Botón "Duplicado" (Tabla 1, ambas secciones): la factura se duplicó, este
  // renglón no es un faltante real. Guarda duplicado=true y retira la fila,
  // sin pasar por clienteQuiere (mismo patrón que marcarIrrelevante).
  const marcarDuplicado = useCallback(
    (it: Item) => {
      withExit([keyOf(it)], "left", () => {
        setItems((rs) => rs.filter((r) => keyOf(r) !== keyOf(it)));
        fetch("/api/deposito/faltantes/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha,
            nroPedOrigen: it.NroPedOrigen,
            nroRengOrigen: it.NroRengOrigen,
            codArticulo: it.CodArticulo,
            fechaArribo: it.fechaArribo === "EN_STOCK" ? null : it.fechaArribo,
            clienteQuiere: null,
            duplicado: true,
          }),
        })
          .then((r) => {
            if (!r.ok) throw new Error();
          })
          .catch(() => {
            setError("No se pudo marcar como duplicado");
            load();
          });
      });
    },
    [fecha, load, withExit],
  );

  const extraordinarios = useMemo(() => items.filter((it) => it.extraordinario), [items]);
  const normales = useMemo(
    () => items.filter((it) => !it.extraordinario && it.fechaArribo !== "EN_STOCK"),
    [items],
  );
  const gruposExtra = useMemo(() => agrupar(extraordinarios), [extraordinarios]);
  const gruposNormales = useMemo(() => agrupar(normales), [normales]);
  const gruposListos = useMemo(() => agruparListos(listos), [listos]);
  const conArribo = useMemo(() => items.filter((it) => it.fechaArribo), [items]);
  const gruposConArribo = useMemo(() => agrupar(conArribo), [conArribo]);

  const itemsVisibles = flipped ? conArribo : items;
  const exportar = useCallback(
    () => exportarFaltantesVentas(itemsVisibles, listos),
    [itemsVisibles, listos],
  );

  const tot = useMemo(() => {
    let importe = 0;
    for (const it of items) importe += it.Importe || 0;
    return { art: items.length, extra: extraordinarios.length, listos: listos.length, importe };
  }, [items, extraordinarios, listos]);

  const hay = items.length > 0 || listos.length > 0;

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {(loading || error) && (
        <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2">
          {loading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" /> Consultando la base…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300">
              <AlertTriangle size={16} className="text-red-400" /> {error}
            </div>
          )}
        </div>
      )}

      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex items-center justify-between px-4 md:px-8 h-16 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-bold text-yellow-400 text-xl md:text-2xl tracking-wide uppercase whitespace-nowrap">
            EVER WEAR <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="hidden md:block w-px h-7 bg-yellow-400/30" />
          <span className="hidden md:inline text-zinc-500 text-sm">
            Faltantes de ventas · {fmtAr(fecha)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline text-zinc-400">
            <b className="text-yellow-400">{tot.art}</b> art. ·{" "}
            <b className="text-red-400">{tot.extra}</b> extraord. ·{" "}
            <b className="text-green-400">{tot.listos}</b> listos ·{" "}
            <b className="text-zinc-200">${fmtNum(tot.importe)}</b>
          </span>
          <button
            onClick={() => setFlipped((v) => !v)}
            title="Ver ingresados (con fecha de arribo) — gira la tabla"
            className={`chip-anim flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium ${
              conArribo.length > 0
                ? "bg-green-500/15 border-green-400 text-green-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            <RotateCw
              size={14}
              className={`transition-transform duration-500 ${flipped ? "rotate-180" : ""}`}
            />
            Ingresados
            {conArribo.length > 0 && (
              <span className="bg-green-500 text-white rounded-full px-1.5 text-[10px] leading-4 tabular-nums">
                {conArribo.length}
              </span>
            )}
          </button>
          <button
            onClick={exportar}
            disabled={!hay}
            title="Exportar a Excel lo que se ve en la tabla"
            className="chip-anim flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-yellow-400 hover:text-yellow-400 text-xs font-medium disabled:opacity-40 disabled:hover:scale-100 disabled:hover:translate-y-0"
          >
            <Download size={14} /> Excel
          </button>
          <button
            onClick={load}
            title="Refrescar"
            disabled={loading}
            className="btn-anim text-zinc-400 hover:text-yellow-400 p-2 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:translate-y-0"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-3 md:px-8 py-6">
        {!hay ? (
          <div className="flex flex-col items-center justify-center py-28 gap-3 text-center">
            {loading ? (
              <Loader2 size={40} className="text-yellow-400 animate-spin" />
            ) : (
              <PackageCheck size={44} className="text-zinc-700" />
            )}
            <p className="text-zinc-400 font-medium">
              {loading ? "Consultando la base…" : "No hay faltantes pendientes."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {!flipped && gruposExtra.length > 0 && (
              <section className="flex flex-col gap-3">
                {gruposExtra.map((g) => (
                  <GrupoCard
                    key={g.key}
                    g={g}
                    extra
                    onDecidir={decidir}
                    onIrrelevante={marcarIrrelevante}
                    onDuplicado={marcarDuplicado}
                    leaving={leaving}
                  />
                ))}
              </section>
            )}

            {!flipped && gruposNormales.length > 0 && (
              <section className="flex flex-col gap-3">
                {gruposNormales.map((g) => (
                  <GrupoCard
                    key={g.key}
                    g={g}
                    onDecidir={decidir}
                    onIrrelevante={marcarIrrelevante}
                    onDuplicado={marcarDuplicado}
                    leaving={leaving}
                  />
                ))}
              </section>
            )}

            {flipped && gruposConArribo.length > 0 && (
              <section className="flex flex-col gap-3">
                {gruposConArribo.map((g) => (
                  <GrupoCard
                    key={g.key}
                    g={g}
                    vendidoMode
                    onDecidir={decidirVendidoTabla1}
                    onIrrelevante={marcarIrrelevante}
                    leaving={leaving}
                  />
                ))}
              </section>
            )}

            {gruposListos.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 text-sm font-medium text-green-400 uppercase tracking-wide">
                  <PackageCheck size={16} /> Listos para vender (ya ingresaron)
                </h2>
                {gruposListos.map((g) => (
                  <GrupoCardListo key={g.key} g={g} onDecidir={decidirVendido} leaving={leaving} />
                ))}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function GrupoCard({
  g, extra, vendidoMode, onDecidir, onIrrelevante, onDuplicado, leaving = {},
}: {
  g: Grupo;
  extra?: boolean;
  vendidoMode?: boolean;
  onDecidir: (it: Item, quiere: boolean) => void;
  onIrrelevante?: (it: Item) => void;
  onDuplicado?: (it: Item) => void;
  leaving?: Record<string, "left" | "right">;
}) {
  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        extra ? "border-red-900/50 bg-red-500/[0.05]" : "border-zinc-800 bg-[#161616]"
      }`}
    >
      <div className={`flex items-center gap-4 px-4 py-3 border-b ${
        extra ? "bg-red-500/[0.08] border-red-900/40" : "bg-[#1A1A1A] border-zinc-800"
      }`}>
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 min-w-0">
          <Campo label="Cliente" value={g.clienteNombre || g.cliente || "—"} />
          <Campo label="Factura / Pedido" value={<span className="font-mono text-yellow-400">{g.pedido}</span>} />
          <Campo label="Artículos" value={`${g.items.length}`} />
        </div>
        <div className="shrink-0 text-right hidden sm:block">
          <div className="text-sm tabular-nums text-zinc-200">${fmtNum(g.importe)}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#141414] text-zinc-400">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Cód.</th>
              <th className="px-3 py-2 font-medium">Artículo</th>
              <th className="px-3 py-2 font-medium text-right">Cant. faltante</th>
              <th className="px-3 py-2 font-medium">Fecha faltante</th>
              <th className="px-3 py-2 font-medium">Fecha arribo</th>
              <th className="px-3 py-2 font-medium text-right">Importe</th>
              <th className="px-3 py-2 font-medium text-center">{vendidoMode ? "Vendido" : "Acción"}</th>
            </tr>
          </thead>
          <tbody>
            {g.items.map((it) => {
              const dir = leaving[keyOf(it)];
              return (
              <tr
                key={keyOf(it)}
                className={`border-t border-zinc-800/70 animate-in fade-in duration-300 ${
                  dir === "right" ? "row-out-right" : dir === "left" ? "row-out-left" : ""
                }`}
              >
                <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">{it.CodArticulo}</td>
                <td className="px-3 py-2 text-zinc-100">{it.Nombre}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNum(it.CantPend)}</td>
                <td className="px-3 py-2 text-zinc-400 whitespace-nowrap tabular-nums">{fmtAr(it.Fecha)}</td>
                <td className="px-3 py-2 text-zinc-400 whitespace-nowrap tabular-nums">
                  {fmtAr(it.fechaArribo)}
                  {it.arriboOC && it.fechaArribo && (
                    <span
                      className="ml-1.5 text-[10px] text-sky-400/80 align-middle"
                      title="Fecha estimada de la OC pendiente (editable en Compras → Faltantes, columna Arribo)"
                    >
                      OC
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-300">${fmtNum(it.Importe)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => onDecidir(it, true)}
                      disabled={!!dir}
                      title={vendidoMode ? "Vendido" : "Lo quiere"}
                      className="btn-anim p-1.5 rounded-md border border-zinc-700 text-green-500 hover:bg-green-600/20 disabled:opacity-40"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      onClick={() => onDecidir(it, false)}
                      disabled={!!dir}
                      title={vendidoMode ? "No vendido" : "No lo quiere"}
                      className="btn-anim p-1.5 rounded-md border border-zinc-700 text-red-500 hover:bg-red-600/20 disabled:opacity-40"
                    >
                      <X size={15} />
                    </button>
                    {onIrrelevante && (
                      <button
                        onClick={() => onIrrelevante(it)}
                        disabled={!!dir}
                        title="Irrelevante — descartar"
                        className="btn-anim p-1.5 rounded-md border border-zinc-700 text-violet-600 hover:bg-violet-800/25 hover:text-violet-500 disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                    {onDuplicado && (
                      <button
                        onClick={() => onDuplicado(it)}
                        disabled={!!dir}
                        title="Duplicado — factura duplicada, ignorar"
                        className="btn-anim p-1.5 rounded-md border border-zinc-700 text-amber-600 hover:bg-amber-800/25 hover:text-amber-500 disabled:opacity-40"
                      >
                        <Copy size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrupoCardListo({
  g, onDecidir, leaving = {},
}: {
  g: GrupoListo;
  onDecidir: (it: ItemListo, vendido: boolean) => void;
  leaving?: Record<string, "left" | "right">;
}) {
  return (
    <div className="rounded-xl border border-green-900/50 bg-green-500/[0.05] overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-green-500/[0.08] border-green-900/40">
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 min-w-0">
          <Campo label="Cliente" value={g.clienteNombre || g.cliente || "—"} />
          <Campo label="Factura / Pedido" value={<span className="font-mono text-yellow-400">{g.pedido}</span>} />
          <Campo label="Artículos" value={`${g.items.length}`} />
        </div>
        <div className="shrink-0 text-right hidden sm:block">
          <div className="text-sm tabular-nums text-zinc-200">${fmtNum(g.importe)}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#141414] text-zinc-400">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Cód.</th>
              <th className="px-3 py-2 font-medium">Artículo</th>
              <th className="px-3 py-2 font-medium text-right">Cant. faltante</th>
              <th className="px-3 py-2 font-medium">Fecha faltante</th>
              <th className="px-3 py-2 font-medium">Fecha arribo</th>
              <th className="px-3 py-2 font-medium text-right">Importe</th>
              <th className="px-3 py-2 font-medium text-center">Vendido</th>
            </tr>
          </thead>
          <tbody>
            {g.items.map((it) => {
              const dir = leaving[keyOf(it)];
              return (
                <tr
                  key={keyOf(it)}
                  className={`border-t border-zinc-800/70 animate-in fade-in duration-300 ${
                    dir === "right" ? "row-out-right" : dir === "left" ? "row-out-left" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">{it.CodArticulo}</td>
                  <td className="px-3 py-2 text-zinc-100">{it.Nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(it.CantPend)}</td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap tabular-nums">{fmtAr(it.Fecha)}</td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap tabular-nums">{fmtAr(it.fechaArribo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-300">${fmtNum(it.Importe)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onDecidir(it, true)}
                        disabled={!!dir}
                        title="Vendido"
                        className="btn-anim p-1.5 rounded-md border border-zinc-700 text-green-500 hover:bg-green-600/20 disabled:opacity-40"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        onClick={() => onDecidir(it, false)}
                        disabled={!!dir}
                        title="No vendido"
                        className="btn-anim p-1.5 rounded-md border border-zinc-700 text-red-500 hover:bg-red-600/20 disabled:opacity-40"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-100 truncate">{value}</div>
    </div>
  );
}
