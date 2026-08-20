"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Loader2,
  AlertTriangle,
  Search,
  Users,
  Table2,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  Trophy,
  X,
  ListChevronsUpDown,
} from "lucide-react";
import { InicioButton } from "@/components/ui/InicioButton";

// ──────────────────────────────────────────────────────────────────────────────
// /ventas/vendedor — pedido de Pablo 2026-08-14: vista de ventas por línea de
// artículo de UN cliente, con año actual y año anterior lado a lado.
//
//   · Filtro arriba: búsqueda de cliente por código O por nombre (substring),
//     autocomplete contra /api/ventas/vendedor/clientes. Al elegir un cliente
//     de la lista la tabla se carga sola (pedido de Pablo 2026-08-14: se
//     sacó el botón "Filtrar", antes había que elegir y después presionarlo).
//   · Switch "Unidades / Pesos": cambia qué valor muestra la tabla (cantidad
//     neta vendida vs. monto neto vendido) — mismos datos, otra columna.
//   · Tabla: primera columna = línea de artículo (StkFer_ArtParamet.Nivel1),
//     agrupando los artículos. El resto son año anterior y año en curso
//     (total). Botón "Desglosar" separa cada año en sus 12 meses,
//     manteniendo la agrupación por año (encabezado de 2 filas: año arriba,
//     mes abajo) — "Agrupar" vuelve a colapsar a un total por año.
//
//   Fuente: /api/ventas/vendedor → indicadores-api fetch_ventas_por_linea
//   (Ven_CompCabecera + Ven_CompRenglon, venta NETA de nota de crédito, mismo
//   criterio ya verificado contra el pivot Excel real — ver
//   HANDOFF_extracciones_sql.md).
// ──────────────────────────────────────────────────────────────────────────────

interface Cliente {
  numero: number;
  nombre: string | null;
}

interface MesVal {
  mes: number;
  label: string;
  cantidad: number;
  monto: number;
}

interface AnioVal {
  cantidad: number;
  monto: number;
  meses: MesVal[];
}

interface LineaRow {
  linea: string;
  anioAnterior: AnioVal;
  anioActual: AnioVal;
}

interface RespVentasVendedor {
  cliente: { codigo: number; nombre: string | null };
  anioAnterior: number;
  anioActual: number;
  tieneDatos: boolean;
  lineas: LineaRow[];
  totales: { anioAnterior: AnioVal; anioActual: AnioVal };
}

// Rankings del pie de la vista — debajo de la tabla principal, con su
// PROPIO rango de meses (default últimos 12 — pedido de Pablo 2026-08-18,
// "de septiembre 2025 a agosto 2026"), independiente del cliente elegido en
// el buscador y del período YTD/meses de la tabla principal.
//
// Son DOS rankings que comparten el rango y se alternan con un switch
// propio (pedido de Pablo 2026-08-18):
//   · Clientes → solo $ gastado (ya NO cambia con el switch Unidades/Pesos
//     de la tabla de arriba: acá el monto es lo único que se muestra).
//   · Líneas   → solo unidades compradas.
// Cada uno trae además el TOTAL de filas que entran en la filtración
// (`totalClientes` / `totalLineas`), que es mayor que las 10 que se listan.
//
// Todo el recorte por fecha y el orden lo hace el back en SQL (ver
// fetch_top_clientes / fetch_top_lineas en ventas.py) — acá no se filtra ni
// se reordena nada.
interface TopCliente {
  numero: number;
  nombre: string | null;
  monto: number;
}

interface RespTopClientes {
  desde: string; // "YYYY-MM"
  hasta: string; // "YYYY-MM"
  totalClientes: number;
  porMonto: TopCliente[];
}

interface TopLinea {
  linea: string;
  unidades: number;
}

interface RespTopLineas {
  desde: string; // "YYYY-MM"
  hasta: string; // "YYYY-MM"
  totalLineas: number;
  porUnidades: TopLinea[];
}

// Clientes que compraron una línea puntual, de mayor a menor gasto — para
// el modal cuando se hace click en una línea del ranking de abajo (pedido
// de Pablo 2026-08-18).
interface ClientePorLinea {
  numero: number;
  nombre: string | null;
  monto: number;
}

interface RespClientesPorLinea {
  linea: string;
  desde: string; // "YYYY-MM"
  hasta: string; // "YYYY-MM"
  totalClientes: number;
  porMonto: ClientePorLinea[];
}

type TopVista = "clientes" | "lineas";

const MESES_CORTOS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
const formatYm = (ym: string): string => {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES_CORTOS_ES[m - 1] ?? ym} ${a}`;
};

type Modo = "unidades" | "pesos";
type Periodo = "ytd" | "meses";

const fmtNum = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n || 0);
const fmtMoney = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n || 0);

// Texto mostrado en el input una vez elegido un cliente de la lista — se usa
// también para detectar "no volver a buscar" en el efecto de abajo.
const labelCliente = (c: Cliente) => (c.nombre ? `${c.nombre} (${c.numero})` : String(c.numero));

// ── Agrupado en acordeón (pedido de Pablo 2026-08-19) ───────────────────────
// El back ya no recorta los rankings/búsquedas — trae TODOS los
// clientes/líneas que entran en el rango (ver indicadores-api/main.py). Con
// cientos de filas la tabla se vuelve ilegible, así que acá se agrupan de a
// GROUP_SIZE en bloques colapsables (1–50, 51–100, …) dentro de la MISMA
// tabla (un <tbody> por grupo, con una fila-header que abre/cierra ese
// grupo) — el <thead>/<tfoot> no se repiten. Se aplica a las 3 tablas que
// pueden crecer mucho: Top clientes/líneas (ranking del pie), clientes por
// línea (modal al clickear una línea) y líneas por cliente (modal al buscar
// un cliente puntual). Acordeón real: solo un grupo abierto a la vez (ver
// los `set*GrupoAbierto` que se usan como componente controlado, un solo
// número de estado en vez de un Set de índices).
const GROUP_SIZE = 50;

function agrupar<T>(items: T[]): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < items.length; i += GROUP_SIZE) {
    grupos.push(items.slice(i, i + GROUP_SIZE));
  }
  return grupos;
}

// Fila-header de un grupo — SIEMPRE la primera fila del <tbody> de ese
// grupo. `colSpan` tiene que cubrir todas las columnas de la tabla en la que
// se usa (varía: 3 en las tablas simples, 2 + 2*colSpanAnio en la de
// línea×año con el desglose mensual).
function FilaGrupo({
  idx,
  desde,
  hasta,
  total,
  abierto,
  onClick,
  colSpan,
}: {
  idx: number;
  desde: number;
  hasta: number;
  total: number;
  abierto: boolean;
  onClick: () => void;
  colSpan: number;
}) {
  return (
    <tr
      className={`cursor-pointer border-t border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 transition-colors ${
        abierto ? "border-b border-yellow-400/30" : ""
      }`}
      onClick={onClick}
    >
      <td colSpan={colSpan} className="px-3 py-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-300">
          {abierto ? (
            <ChevronUp size={14} className="text-yellow-400" />
          ) : (
            <ChevronDown size={14} className="text-zinc-500" />
          )}
          {desde + 1}–{hasta}
          <span className="text-zinc-500 font-normal normal-case">de {total}</span>
        </span>
      </td>
    </tr>
  );
}

export default function VentasVendedorPage() {
  // ── Búsqueda / selección de cliente ────────────────────────────────────
  const [qCliente, setQCliente] = useState("");
  const [sugerencias, setSugerencias] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSug, setMostrarSug] = useState(false);
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  // true si el back respondió "sin vendedor asignado" (usuario no-admin sin
  // usuario.vendedorCodigo, ver /admin/usuarios) — acceso por vendedor,
  // pedido de Pablo 2026-08-14: en ese caso el buscador nunca va a
  // devolver nada, mejor explicarlo en vez de que parezca que no encuentra
  // clientes.
  const [sinVendedorAsignado, setSinVendedorAsignado] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const texto = qCliente.trim();
    // Recién elegido de la lista (ver elegirCliente) — el input ya muestra
    // "Nombre (código)" y no hace falta volver a buscar nada.
    if (!texto || (clienteSel && texto === labelCliente(clienteSel))) {
      setSugerencias([]);
      return;
    }
    if (texto.length < 2) {
      setSugerencias([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ventas/vendedor/clientes?q=${encodeURIComponent(texto)}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        setSugerencias(Array.isArray(j?.clientes) ? j.clientes : []);
        setSinVendedorAsignado(!!j?.sinVendedorAsignado);
        setMostrarSug(true);
      } catch {
        setSugerencias([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qCliente]);

  // ── Tabla: se carga automáticamente al elegir un cliente de la lista ───
  const [data, setData] = useState<RespVentasVendedor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Acordeón de la tabla línea×año (ver agrupar/FilaGrupo arriba) — índice
  // del grupo de 50 abierto (0 = primero). Se resetea a 0 en cada fetch
  // (cliente nuevo, o el mismo cliente de nuevo).
  const [filasGrupoAbierto, setFilasGrupoAbierto] = useState(0);
  // Vista activa del ranking del pie ("Top 10 clientes"/"Top 10 líneas") —
  // la alterna el botón "Mostrar" propio de esa sección (pedido de Pablo
  // 2026-08-18). Independiente del modal (ver `vistaModal` más abajo): el
  // modal ahora vive en su propio popup con su propio filtro, no comparte
  // estado con el ranking de la página.
  const [topVista, setTopVista] = useState<TopVista>("clientes");
  const modo: Modo = topVista === "clientes" ? "pesos" : "unidades";
  const [desglosado, setDesglosado] = useState(false);

  // ── Modal "Ventas por cliente y línea" ──────────────────────────────────
  // Se abre al hacer click en un cliente o en una línea del ranking de abajo
  // (pedido de Pablo 2026-08-18: "convertí la parte de arriba en un modal").
  // `modalMode` decide qué contenido muestra:
  //   · "cliente" → el buscador + la tabla línea×año de siempre (idéntico
  //     al comportamiento anterior, ahora dentro del modal).
  //   · "linea"   → una tabla nueva con los CLIENTES que compraron esa
  //     línea, de mayor a menor gasto ($) — ver fetchClientesPorLinea.
  // El buscador de cliente sigue disponible en el header del modal en
  // ambos modos: elegir un cliente ahí siempre pivotea a "cliente".
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"cliente" | "linea">("cliente");
  const [modalLinea, setModalLinea] = useState<string | null>(null);
  const cerrarModal = useCallback(() => setModalOpen(false), []);

  // Filtro del modal colapsable (pedido de Pablo 2026-08-18: "abarca mucho
  // la parte de filtro, pon que se esconda con un boton") — arranca visible
  // y se puede plegar con el botón del header para dejarle más lugar a la
  // tabla; se reabre solo cada vez que se abre el modal de nuevo.
  const [filtroVisible, setFiltroVisible] = useState(true);

  // Métrica (pesos/unidades) de la tabla línea×año del modal, en modo
  // "cliente" — mismo switch "Mostrar" de siempre, pero ahora es un estado
  // PROPIO del modal (no el `topVista` de arriba): antes un solo botón
  // controlaba a la vez la tabla principal y el ranking del pie; separados,
  // togglear uno ya no cambia el otro.
  const [vistaModal, setVistaModal] = useState<TopVista>("clientes");
  const modoModal: Modo = vistaModal === "clientes" ? "pesos" : "unidades";

  // Clientes por línea (modal en modo "linea") — ver
  // /api/ventas/vendedor/clientes-por-linea (fetch_clientes_por_linea en
  // ventas.py), mismo rango fijo de 12 meses que los rankings del pie.
  const [clientesLinea, setClientesLinea] = useState<RespClientesPorLinea | null>(null);
  const [clientesLineaLoading, setClientesLineaLoading] = useState(false);
  const [clientesLineaError, setClientesLineaError] = useState<string | null>(null);
  // Acordeón de esta tabla (ver agrupar/FilaGrupo arriba) — se resetea al
  // grupo 0 cada vez que se pide una línea nueva, si no quedaría "colgado"
  // en un grupo que puede no existir para el nuevo set de clientes.
  const [clientesLineaGrupoAbierto, setClientesLineaGrupoAbierto] = useState(0);

  // `rango` (pedido de Pablo 2026-08-20): antes siempre pegaba sin
  // desde/hasta y el back resolvía la ventana fija de 12 meses
  // (últimos 12 meses cerrados). Ahora manda el rango YTD/Meses actual
  // (ver `rangoPeriodo` más abajo) — la ruta y fetch_clientes_por_linea ya
  // aceptaban desde/hasta de antes (quedó la plomería, solo no se usaba).
  // `rango === null` es el caso borde de YTD en enero (sin mes anterior
  // este año): no pega al back, deja la tabla vacía directamente.
  const fetchClientesPorLinea = useCallback(
    async (linea: string, rango: { desde: string; hasta: string } | null) => {
      setClientesLineaLoading(true);
      setClientesLineaError(null);
      setClientesLineaGrupoAbierto(0);
      if (!rango) {
        setClientesLinea(null);
        setClientesLineaLoading(false);
        return;
      }
      try {
        const qs = new URLSearchParams({ linea, desde: rango.desde, hasta: rango.hasta });
        const res = await fetch(`/api/ventas/vendedor/clientes-por-linea?${qs.toString()}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setClientesLinea(j);
      } catch (e) {
        setClientesLineaError(e instanceof Error ? e.message : "Error al cargar");
        setClientesLinea(null);
      } finally {
        setClientesLineaLoading(false);
      }
    },
    [],
  );

  // Recibe el código directamente (en vez de leer clienteSel) porque
  // setClienteSel es asíncrono — si dependiéramos del estado, elegirCliente
  // dispararía la consulta con el valor viejo (null) en el mismo render.
  const fetchVentas = useCallback(async (codigo: number) => {
    setLoading(true);
    setError(null);
    setFilasGrupoAbierto(0);
    try {
      const res = await fetch(`/api/ventas/vendedor?cliente=${codigo}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const elegirCliente = useCallback(
    (c: Cliente) => {
      setClienteSel(c);
      setQCliente(labelCliente(c));
      setSugerencias([]);
      setMostrarSug(false);
      // Elegir un cliente desde el buscador del modal siempre pivotea a modo
      // "cliente" — por si se venía de modo "linea" (click en un cliente
      // dentro de la tabla de clientes-por-línea, o búsqueda manual).
      setModalMode("cliente");
      fetchVentas(c.numero);
    },
    [fetchVentas],
  );

  // Dispara el modal en modo "cliente" — al hacer click en un cliente del
  // ranking "Top 10 clientes" (pedido de Pablo 2026-08-18) o en una fila de
  // la tabla de clientes-por-línea (drill-down). Mismo comportamiento que
  // elegir un cliente del buscador.
  const abrirModalCliente = useCallback(
    (c: Cliente) => {
      setModalOpen(true);
      setFiltroVisible(true);
      elegirCliente(c);
    },
    [elegirCliente],
  );

  // abrirModalLinea se define más abajo (necesita `rangoPeriodo`, que
  // depende del estado `periodo` — ver esa sección).

  // Abre el modal vacío en modo "cliente", listo para buscar — para no
  // perder la posibilidad de buscar CUALQUIER cliente (no solo los del Top
  // 10) ahora que el buscador vive dentro del modal.
  const abrirModalBusqueda = useCallback(() => {
    setModalMode("cliente");
    setClienteSel(null);
    setQCliente("");
    setSugerencias([]);
    setData(null);
    setModalOpen(true);
    setFiltroVisible(true);
  }, []);

  // ── Rankings del pie: top clientes ($) y top líneas (unidades) ─────────
  // Independientes del cliente buscado arriba y del período YTD/meses de la
  // tabla principal. El rango es FIJO y lo resuelve el back (pedido de
  // Pablo 2026-08-18): 12 meses terminando en el MES ANTERIOR al actual —
  // en agosto 2026, agosto 2025 a julio 2026. Ya no hay selector de fechas,
  // así que acá no se manda `desde`/`hasta` y el fetch corre UNA sola vez
  // al montar.
  //
  // Se piden los DOS (no solo el de la vista activa): el back cachea 15 min,
  // así que alternar Clientes/Líneas es instantáneo en vez de disparar un
  // fetch nuevo cada vez.
  const [topClientes, setTopClientes] = useState<RespTopClientes | null>(null);
  const [topLineas, setTopLineas] = useState<RespTopLineas | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  // Acordeón de este ranking (ver agrupar/FilaGrupo arriba) — se resetea al
  // grupo 0 al alternar Clientes/Líneas (botón "Mostrar" de abajo).
  const [topGrupoAbierto, setTopGrupoAbierto] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setTopLoading(true);
    setTopError(null);
    const pedir = async (ruta: string) => {
      const res = await fetch(`/api/ventas/vendedor/${ruta}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      return j;
    };
    Promise.all([pedir("top-clientes"), pedir("top-lineas")])
      .then(([cli, lin]) => {
        if (cancelado) return;
        setTopClientes(cli);
        setTopLineas(lin);
      })
      .catch((e) => {
        if (!cancelado) setTopError(e instanceof Error ? e.message : "Error al cargar los rankings");
      })
      .finally(() => {
        if (!cancelado) setTopLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Respuesta y total de la pestaña activa. El rango que se muestra en el
  // encabezado sale del BACK (que es quien resuelve el default), no del
  // estado local, así lo que dice el título siempre coincide con los datos
  // que hay en la tabla.
  const topResp: { desde: string; hasta: string } | null =
    topVista === "clientes" ? topClientes : topLineas;
  const topTotal: number | null =
    topVista === "clientes"
      ? topClientes?.totalClientes ?? null
      : topLineas?.totalLineas ?? null;

  // ── Período: botón dividido "YTD" / "Meses" (pedido de Pablo 2026-08-14,
  // ajustado 2026-08-20). Un solo estado para TODO el modal (modo "cliente"
  // y modo "linea" comparten el mismo toggle — pedido de Pablo 2026-08-20:
  // "cliente por línea y línea por cliente, ambos casos deben tener filtro
  // ytd y mes"). "YTD" es Enero..mes ANTERIOR al actual (el mes en curso
  // queda afuera por estar incompleto). "Meses" es el mes actual completo,
  // sin recortar por día.
  //
  // En modo "cliente" NO pega al back: la respuesta ya trae el desglose
  // mensual completo de ambos años (ver fetch_ventas_por_linea) y el
  // período se resuelve sumando los meses correspondientes (ver
  // mesesActivos/sumaPeriodo más abajo). En modo "linea" SÍ pega al back
  // con `desde`/`hasta` (ver rangoPeriodo/fetchClientesPorLinea) porque
  // fetch_clientes_por_linea agrega en SQL, no manda desglose mensual.
  const [periodo, setPeriodo] = useState<Periodo>("ytd");
  const mesActualNum = new Date().getMonth() + 1;
  const anioActualNum = new Date().getFullYear();
  // Último mes que entra en el YTD (0 en enero: todavía no hay mes anterior
  // en el año en curso).
  const mesAnteriorNum = mesActualNum - 1;

  const ym = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;

  // Rango "YYYY-MM" para mandarle a /api/ventas/vendedor/clientes-por-linea
  // (modo "linea"), equivalente en fechas absolutas a lo que mesesActivos
  // resuelve localmente para la tabla línea×año del modo "cliente". `null`
  // en el caso borde de YTD en enero: a propósito NO hace roll-over a
  // diciembre del año anterior — "Enero..mes anterior" simplemente no
  // tiene ningún mes que mostrar todavía ese año.
  const rangoPeriodo: { desde: string; hasta: string } | null =
    periodo === "meses"
      ? { desde: ym(anioActualNum, mesActualNum), hasta: ym(anioActualNum, mesActualNum) }
      : mesAnteriorNum >= 1
        ? { desde: ym(anioActualNum, 1), hasta: ym(anioActualNum, mesAnteriorNum) }
        : null;

  // Dispara el modal en modo "linea" — al hacer click en una línea del
  // ranking "Top 10 líneas" (pedido de Pablo 2026-08-18). Va con el
  // `rangoPeriodo` YTD/Meses vigente (pedido de Pablo 2026-08-20).
  const abrirModalLinea = useCallback(
    (linea: string) => {
      setModalMode("linea");
      setModalLinea(linea);
      setModalOpen(true);
      setFiltroVisible(true);
      fetchClientesPorLinea(linea, rangoPeriodo);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchClientesPorLinea, periodo],
  );

  // Si el modal ya está abierto en modo "linea" y el usuario togglea
  // YTD/Meses, vuelve a pedir con el rango nuevo (pedido de Pablo
  // 2026-08-20: "ambos casos deben tener filtro ytd y mes").
  useEffect(() => {
    if (modalMode === "linea" && modalOpen && modalLinea) {
      fetchClientesPorLinea(modalLinea, rangoPeriodo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const handleFiltrar = useCallback(() => {
    if (!clienteSel) return;
    fetchVentas(clienteSel.numero);
  }, [clienteSel, fetchVentas]);

  // Meses que entran en el "Total" mostrado, según el modo de período.
  const mesesActivos =
    periodo === "ytd"
      ? Array.from({ length: mesAnteriorNum }, (_, i) => i + 1)
      : [mesActualNum];

  const sumaPeriodo = useCallback(
    (a: AnioVal) =>
      a.meses.reduce(
        (acc, m) =>
          mesesActivos.includes(m.mes)
            ? { cantidad: acc.cantidad + m.cantidad, monto: acc.monto + m.monto }
            : acc,
        { cantidad: 0, monto: 0 },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodo, mesActualNum],
  );

  // Nota: usan `modoModal` (estado propio del modal, ver `vistaModal` más
  // arriba), no el `modo` del ranking del pie — la tabla línea×año vive
  // ahora en el modal y tiene su propio switch "Mostrar".
  const valor = useCallback(
    (a: { cantidad: number; monto: number }) => (modoModal === "unidades" ? a.cantidad : a.monto),
    [modoModal],
  );
  const valorMes = useCallback(
    (m: MesVal) => (modoModal === "unidades" ? m.cantidad : m.monto),
    [modoModal],
  );
  const fmt = modoModal === "unidades" ? fmtNum : fmtMoney;
  // Formateador del ranking del pie (Top 10 clientes/líneas) — ese sí sigue
  // atado a `modo`/`topVista`.
  const fmtTop = modo === "unidades" ? fmtNum : fmtMoney;

  const filas = data?.lineas ?? [];
  const hayTabla = !!data;
  const sinDatos = !!data && !data.tieneDatos;
  // Único caso sin meses: YTD en enero (todavía no hay mes anterior).
  const sinMesesPeriodo = periodo === "ytd" && mesesActivos.length === 0;

  // Desglosado: en "meses" mostrás solo el mes actual (1 columna); en "ytd"
  // Enero..mes anterior, mismo criterio que ya usa sumaPeriodo/mesesActivos.
  const mesesMostrados = mesesActivos;
  const nMesesMostrados = mesesMostrados.length;
  const colSpanAnio = desglosado ? nMesesMostrados + 1 : 1;
  const labelDeMes = (a: AnioVal, mes: number) =>
    a.meses.find((m) => m.mes === mes)?.label ?? "";

  // ── Fila verde si creció + fila/columna iluminada según el mouse (pedido
  // de Pablo 2026-08-14) ──────────────────────────────────────────────────
  // Índices de columna: Línea=0, después las columnas de meses mostrados
  // del año anterior (en el mismo orden que mesesMostrados), Total
  // anterior, columnas de meses mostrados del año actual, Total actual.
  const COL_LINEA = 0;
  const colAnteriorMes = (mes: number) => 1 + mesesMostrados.indexOf(mes);
  const colAnteriorTotal = desglosado ? 1 + nMesesMostrados : 1;
  const colActualMes = (mes: number) => colAnteriorTotal + 1 + mesesMostrados.indexOf(mes);
  const colActualTotal = desglosado ? colAnteriorTotal + 1 + nMesesMostrados : 2;

  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const limpiarHover = useCallback(() => {
    setHoverRow(null);
    setHoverCol(null);
  }, []);
  // Clase de fondo de una celda: verde si la fila creció (año actual >
  // año anterior, sobre el mismo valor/período que ya se muestra), más
  // intenso si además está en la fila u la columna donde está el mouse;
  // si no creció, un tinte amarillo tenue solo cuando está iluminada.
  const celda = useCallback(
    (rowIdx: number, colIdx: number, crece: boolean) => {
      const iluminada = hoverRow === rowIdx || hoverCol === colIdx;
      if (crece) return iluminada ? "bg-green-500/25" : "bg-green-500/10";
      return iluminada ? "bg-yellow-400/10" : "";
    },
    [hoverRow, hoverCol],
  );
  const crece = useCallback(
    (r: { anioAnterior: AnioVal; anioActual: AnioVal }) =>
      valor(sumaPeriodo(r.anioActual)) > valor(sumaPeriodo(r.anioAnterior)),
    [valor, sumaPeriodo],
  );

  // Triángulo ▲/▼ por línea, columna nueva al final de la tabla (pedido de
  // Pablo 2026-08-18). Compara año actual vs. año anterior sobre el MISMO
  // valor/período que ya muestra la fila (sumaPeriodo + valor: respeta
  // YTD/meses y pesos/unidades, igual que `crece`). "sube" = año actual >
  // año anterior (▲ verde), "baja" = año actual < año anterior (▼ rojo),
  // "igual" = mismo valor — incluye 0 vs 0 (sin ventas) y empates reales:
  // sin triángulo, sin tocar el fondo de esa celda.
  const tendencia = useCallback(
    (r: { anioAnterior: AnioVal; anioActual: AnioVal }): "sube" | "baja" | "igual" => {
      const ant = valor(sumaPeriodo(r.anioAnterior));
      const act = valor(sumaPeriodo(r.anioActual));
      if (act > ant) return "sube";
      if (act < ant) return "baja";
      return "igual";
    },
    [valor, sumaPeriodo],
  );
  // Celda de la columna "Tendencia": fondo sólido verde/rojo solo cuando hay
  // una dirección real (pedido de Pablo: "si no hay ventas o es 0 no hay
  // que tocarle el fondo").
  const celdaTendencia = (t: "sube" | "baja" | "igual") => {
    if (t === "sube") return "bg-green-500/20 text-green-400";
    if (t === "baja") return "bg-red-500/20 text-red-400";
    return "text-zinc-600";
  };
  const iconoTendencia = (t: "sube" | "baja" | "igual") => (t === "sube" ? "▲" : t === "baja" ? "▼" : "—");

  // ── Agrupado en acordeón (ver agrupar/FilaGrupo/GROUP_SIZE arriba) — un
  // bloque por tabla larga, calculado acá porque las tres dependen de
  // estado que ya está en scope (filas, topVista/topClientes/topLineas,
  // clientesLinea). `*GrupoSeguro` evita quedar apuntando a un grupo que
  // dejó de existir (ej. cambió el listado y ahora hay menos grupos).
  const filasGrupos = agrupar(filas);
  const filasGrupoSeguro = Math.min(filasGrupoAbierto, Math.max(0, filasGrupos.length - 1));
  const totalColsLineaAnio = 2 + 2 * colSpanAnio; // Línea + Año ant. + Año act. + Tend.

  const topItems: (TopCliente | TopLinea)[] =
    topVista === "clientes" ? topClientes?.porMonto ?? [] : topLineas?.porUnidades ?? [];
  const topGrupos = agrupar(topItems);
  const topGrupoSeguro = Math.min(topGrupoAbierto, Math.max(0, topGrupos.length - 1));

  const clientesLineaItems = clientesLinea?.porMonto ?? [];
  const clientesLineaGrupos = agrupar(clientesLineaItems);
  const clientesLineaGrupoSeguro = Math.min(clientesLineaGrupoAbierto, Math.max(0, clientesLineaGrupos.length - 1));

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {(loading || error) && (
        <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2">
          {loading && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-yellow-400/40 rounded-xl px-5 py-3 text-sm text-zinc-200">
              <Loader2 size={16} className="animate-spin text-yellow-400" />{" "}
              Consultando la base…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 bg-[#1A1A1A] border border-red-400/40 rounded-xl px-5 py-3 text-sm text-red-300">
              <AlertTriangle size={16} className="text-red-400" /> {error}
            </div>
          )}
        </div>
      )}

      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b-[3px] border-yellow-400 flex flex-wrap items-center justify-between px-4 md:px-8 py-3 gap-4">
        <div className="flex flex-wrap items-center gap-4 min-w-0">
          <InicioButton />
          <span className="font-bold text-yellow-400 text-xl md:text-2xl tracking-wide uppercase whitespace-nowrap">
            EVER WEAR{" "}
            <span className="text-sm tracking-[3px] font-normal">S.A.</span>
          </span>
          <div className="hidden md:block w-px h-7 bg-yellow-400/30" />

          <button
            type="button"
            onClick={abrirModalBusqueda}
            className="btn-anim inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:border-yellow-400 transition-colors"
          >
            <Search size={14} className="text-yellow-400" />
            Buscar cliente
          </button>

          <div className="hidden md:block w-px h-7 bg-yellow-400/30" />

          <h2 className="text-yellow-400 font-bold text-lg uppercase tracking-wide flex items-center gap-2 whitespace-nowrap">
            {/* <Trophy size={18} /> */}
            {topVista === "clientes" ? <Users size={18} /> : <ListChevronsUpDown size={18} />}
            {topVista === "clientes" ? "clientes 1" : "líneas 1"}
          </h2>

          <button
            type="button"
            onClick={() => {
              setTopVista(topVista === "clientes" ? "lineas" : "clientes");
              setTopGrupoAbierto(0);
            }}
            title={`Ver ${topVista === "clientes" ? "líneas" : "clientes"}`}
            className="btn-anim inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:border-yellow-400 transition-colors"
          >
            <ArrowLeftRight size={14} className="text-yellow-400" />
            <span className="font-semibold">
              {topVista === "clientes" ? "Clientes" : "Líneas"}
            </span>
            {/* <span className="text-zinc-500 text-xs">
              {topVista === "clientes" ? "($)" : "(unidades)"}
            </span> */}
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6">
        {/* Modal "Ventas por cliente y línea" (pedido de Pablo 2026-08-18):
            se abre al hacer click en un cliente o una línea del ranking de
            abajo, o en "Buscar cliente" arriba. El filtro queda pegado en
            el header del modal (no scrollea); la tabla scrollea en el
            cuerpo. */}
        {modalOpen && (
          <div
            className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
            onClick={cerrarModal}
          >
            <div
              className="w-full max-w-6xl max-h-[90vh] rounded-xl border border-zinc-800 bg-[#111111] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 bg-[#1A1A1A] border-b border-zinc-800 px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {/* Con el filtro plegado seguimos mostrando qué cliente se
                        está viendo, para no perder el contexto. */}
                    {!filtroVisible && modalMode === "cliente" && data && (
                      <p className="text-sm text-zinc-300 mt-1">
                        {data.cliente.nombre ?? "—"}{" "}
                        <span className="text-zinc-500 font-mono text-xs">
                          ({data.cliente.codigo})
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0"></div>
                </div>

                {/* Filtro (pedido de Pablo 2026-08-18: colapsable con el botón
                  de arriba — antes ocupaba mucho lugar fijo en el header del
                  modal, que no scrollea, y le dejaba poco espacio a la
                  tabla). */}
                {filtroVisible && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 flex flex-wrap items-end gap-4">
                    <div className="flex flex-col gap-1.5 relative">
                      <div className="relative">
                        <Search
                          size={13}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                        />
                        <input
                          id="filtro-cliente"
                          type="text"
                          value={qCliente}
                          onChange={(e) => {
                            setQCliente(e.target.value);
                            setClienteSel(null);
                          }}
                          onFocus={() =>
                            sugerencias.length > 0 && setMostrarSug(true)
                          }
                          onBlur={() => {
                            blurTimeout.current = setTimeout(
                              () => setMostrarSug(false),
                              150,
                            );
                          }}
                          onKeyDown={(e) =>
                            e.key === "Enter" && clienteSel && handleFiltrar()
                          }
                          placeholder="Ej: 1234 o ACME S.A."
                          autoFocus
                          className="bg-[#1f1f1f] border border-zinc-700 rounded-md pl-7 pr-3 py-2 text-sm text-zinc-100 outline-none w-72 focus:border-yellow-400 placeholder:text-zinc-600"
                        />
                        {buscando && (
                          <Loader2
                            size={13}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin"
                          />
                        )}
                        {mostrarSug && sugerencias.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-zinc-700 bg-[#1A1A1A] shadow-xl">
                            {sugerencias.map((c) => (
                              <button
                                key={c.numero}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  if (blurTimeout.current)
                                    clearTimeout(blurTimeout.current);
                                  elegirCliente(c);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-yellow-400/10 hover:text-yellow-400 transition-colors flex items-center justify-between gap-2"
                              >
                                <span className="truncate">
                                  {c.nombre ?? "(sin nombre)"}
                                </span>
                                <span className="text-zinc-500 font-mono text-xs shrink-0">
                                  {c.numero}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {mostrarSug &&
                          sugerencias.length === 0 &&
                          sinVendedorAsignado && (
                            <div className="absolute z-20 mt-1 w-full rounded-md border border-amber-400/40 bg-[#1A1A1A] shadow-xl px-3 py-2.5 text-xs text-amber-300">
                              Tu usuario todavía no tiene un vendedor de Magnus
                              asignado — pedile a un administrador que te lo
                              asigne en Administración → Usuarios.
                            </div>
                          )}
                      </div>
                    </div>

                    {/* Switch pesos/unidades de ESTA tabla (línea×año de un
                    cliente) — estado propio del modal (`vistaModal`), no el
                    del ranking del pie. Solo tiene sentido en modo "cliente";
                    en modo "linea" la tabla de clientes ya es siempre por $
                    (pedido de Pablo 2026-08-18: "de mayor a menor en
                    gasto"). */}
                    {modalMode === "cliente" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setVistaModal(
                                vistaModal === "clientes"
                                  ? "lineas"
                                  : "clientes",
                              )
                            }
                            title={`Ver ${vistaModal === "clientes" ? "líneas" : "clientes"}`}
                            className="btn-anim inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:border-yellow-400 transition-colors"
                          >
                            <ArrowLeftRight
                              size={14}
                              className="text-yellow-400"
                            />
                            <span className="font-semibold">
                              {vistaModal === "clientes"
                                ? "$"
                                : "Unidades"}
                            </span>
                            {/* <span className="text-zinc-500 text-xs">
                              {vistaModal === "clientes" ? "($)" : "(unidades)"}
                            </span> */}
                          </button>
                        </div>

                        {hayTabla && (
                          <button
                            type="button"
                            onClick={() => setDesglosado((v) => !v)}
                            className="btn-anim flex items-center gap-1.5 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-2 hover:border-yellow-400 transition-colors"
                          >
                            {desglosado
                              ? "por año"
                              : "por mes"}
                          </button>
                        )}
                      </>
                    )}

                    {/* Botón dividido: YTD (Ene–mes anterior) vs. Meses (mes
                    actual completo) — pedido de Pablo 2026-08-20: comparte
                    estado (`periodo`) entre modo "cliente" (año actual vs.
                    anterior, filtra el desglose mensual ya traído) y modo
                    "linea" (pega de nuevo al back con desde/hasta, ver
                    rangoPeriodo/fetchClientesPorLinea). Los títulos usan
                    MESES_CORTOS_ES directo (no `labelDeMes`/`data`) porque
                    en modo "linea" no hay tabla línea×año cargada. */}
                    {((modalMode === "cliente" && hayTabla && !sinDatos) ||
                      modalMode === "linea") && (
                      <div className="flex flex-col gap-1.5">
                        <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden text-sm divide-x divide-zinc-700">
                          <button
                            type="button"
                            onClick={() => setPeriodo("ytd")}
                            title={
                              mesAnteriorNum >= 1
                                ? `Acumulado Enero–${MESES_CORTOS_ES[mesAnteriorNum - 1]}`
                                : "Todavía no hay mes anterior este año"
                            }
                            className={`px-3 py-2 transition-colors ${
                              periodo === "ytd"
                                ? "bg-yellow-400 text-black font-semibold"
                                : "text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            YTD
                          </button>
                          <button
                            type="button"
                            onClick={() => setPeriodo("meses")}
                            title={`${MESES_CORTOS_ES[mesActualNum - 1]} completo`}
                            className={`px-3 py-2 transition-colors ${
                              periodo === "meses"
                                ? "bg-yellow-400 text-black font-semibold"
                                : "text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            Meses
                          </button>
                        </div>
                      </div>
                    )}

                    {modalMode === "cliente" && data && (
                      <span className="text-sm text-zinc-500 pb-2">
                        {filas.length} línea(s)
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={cerrarModal}
                      className="text-zinc-500 hover:text-zinc-200 transition-colors"
                      aria-label="Cerrar"
                    >
                      <X size={20} />
                    </button>
                  </div>
                )}

              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {modalMode === "cliente" && (
                  <>
                    {!hayTabla && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
                        <Search size={40} className="text-zinc-700" />
                        <p className="text-zinc-500 text-sm">
                          Buscá un cliente por código o nombre y elegilo de la
                          lista.
                        </p>
                      </div>
                    )}

                    {hayTabla && sinDatos && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
                        <Table2 size={40} className="text-zinc-700" />
                        <p className="text-zinc-500 text-sm">
                          Sin ventas registradas para{" "}
                          {data?.cliente.nombre ?? data?.cliente.codigo} en{" "}
                          {data?.anioAnterior}–{data?.anioActual}.
                        </p>
                      </div>
                    )}

                    {hayTabla && !sinDatos && sinMesesPeriodo && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-16 flex flex-col items-center gap-3 text-center">
                        <Table2 size={40} className="text-zinc-700" />
                        <p className="text-zinc-500 text-sm">
                          Todavía no hay mes anterior este año — probá con
                          &quot;Meses&quot; para ver Enero.
                        </p>
                      </div>
                    )}

                    {hayTabla && !sinDatos && !sinMesesPeriodo && (
                      <div
                        className={`rounded-xl border border-zinc-800 overflow-hidden transition-opacity ${
                          loading ? "opacity-50 pointer-events-none" : ""
                        }`}
                        onMouseLeave={limpiarHover}
                      >
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-max text-sm">
                            <thead className="bg-[#1A1A1A] text-zinc-400">
                              <tr>
                                <th
                                  rowSpan={desglosado ? 2 : 1}
                                  className={`px-3 py-2 font-medium text-left whitespace-nowrap align-bottom cursor-default ${
                                    hoverCol === COL_LINEA
                                      ? "bg-yellow-400/10"
                                      : ""
                                  }`}
                                  onMouseEnter={() => {
                                    setHoverRow(null);
                                    setHoverCol(COL_LINEA);
                                  }}
                                >
                                  Línea
                                </th>
                                <th
                                  colSpan={colSpanAnio}
                                  className={`px-3 py-2 font-medium text-center whitespace-nowrap border-l border-zinc-800 text-zinc-300 ${
                                    !desglosado && hoverCol === colAnteriorTotal
                                      ? "bg-yellow-400/10 cursor-default"
                                      : ""
                                  }`}
                                  onMouseEnter={
                                    desglosado
                                      ? undefined
                                      : () => {
                                          setHoverRow(null);
                                          setHoverCol(colAnteriorTotal);
                                        }
                                  }
                                >
                                  Año {data!.anioAnterior}
                                  {periodo === "ytd" && mesAnteriorNum >= 1 && (
                                    <span className="text-zinc-500 font-normal">
                                      {" "}
                                      (Ene–
                                      {labelDeMes(data!.totales.anioAnterior, mesAnteriorNum)})
                                    </span>
                                  )}
                                  {periodo === "meses" && (
                                    <span className="text-zinc-500 font-normal">
                                      {" "}
                                      ({labelDeMes(data!.totales.anioAnterior, mesActualNum)})
                                    </span>
                                  )}
                                </th>
                                <th
                                  colSpan={colSpanAnio}
                                  className={`px-3 py-2 font-medium text-center whitespace-nowrap border-l border-zinc-800 text-yellow-400 ${
                                    !desglosado && hoverCol === colActualTotal
                                      ? "bg-yellow-400/10 cursor-default"
                                      : ""
                                  }`}
                                  onMouseEnter={
                                    desglosado
                                      ? undefined
                                      : () => {
                                          setHoverRow(null);
                                          setHoverCol(colActualTotal);
                                        }
                                  }
                                >
                                  Año {data!.anioActual}
                                  {periodo === "ytd" && mesAnteriorNum >= 1 && (
                                    <span className="text-yellow-400/60 font-normal">
                                      {" "}
                                      (Ene–
                                      {labelDeMes(data!.totales.anioActual, mesAnteriorNum)})
                                    </span>
                                  )}
                                  {periodo === "meses" && (
                                    <span className="text-yellow-400/60 font-normal">
                                      {" "}
                                      ({labelDeMes(data!.totales.anioActual, mesActualNum)})
                                    </span>
                                  )}
                                </th>
                                <th
                                  rowSpan={desglosado ? 2 : 1}
                                  className="px-3 py-2 font-medium text-center whitespace-nowrap align-bottom border-l border-zinc-800 cursor-default"
                                  title="Año actual vs. año anterior"
                                >
                                  Tend.
                                </th>
                              </tr>
                              {desglosado && (
                                <tr className="text-[11px] text-zinc-500">
                                  {data!.totales.anioAnterior.meses
                                    .filter((m) => mesesActivos.includes(m.mes))
                                    .map((m) => (
                                      <th
                                        key={`pa-${m.mes}`}
                                        className={`px-2 py-1.5 font-normal text-right whitespace-nowrap border-l border-zinc-800/60 cursor-default ${
                                          hoverCol === colAnteriorMes(m.mes)
                                            ? "bg-yellow-400/10"
                                            : ""
                                        }`}
                                        onMouseEnter={() => {
                                          setHoverRow(null);
                                          setHoverCol(colAnteriorMes(m.mes));
                                        }}
                                      >
                                        {m.label}
                                      </th>
                                    ))}
                                  <th
                                    className={`px-2 py-1.5 font-semibold text-right whitespace-nowrap border-l border-zinc-800 text-zinc-300 cursor-default ${
                                      hoverCol === colAnteriorTotal
                                        ? "bg-yellow-400/10"
                                        : ""
                                    }`}
                                    onMouseEnter={() => {
                                      setHoverRow(null);
                                      setHoverCol(colAnteriorTotal);
                                    }}
                                  >
                                    Total
                                  </th>
                                  {data!.totales.anioActual.meses
                                    .filter((m) => mesesActivos.includes(m.mes))
                                    .map((m) => (
                                      <th
                                        key={`pc-${m.mes}`}
                                        className={`px-2 py-1.5 font-normal text-right whitespace-nowrap border-l border-zinc-800/60 cursor-default ${
                                          hoverCol === colActualMes(m.mes)
                                            ? "bg-yellow-400/10"
                                            : ""
                                        }`}
                                        onMouseEnter={() => {
                                          setHoverRow(null);
                                          setHoverCol(colActualMes(m.mes));
                                        }}
                                      >
                                        {m.label}
                                      </th>
                                    ))}
                                  <th
                                    className={`px-2 py-1.5 font-semibold text-right whitespace-nowrap border-l border-zinc-800 text-yellow-400 cursor-default ${
                                      hoverCol === colActualTotal
                                        ? "bg-yellow-400/10"
                                        : ""
                                    }`}
                                    onMouseEnter={() => {
                                      setHoverRow(null);
                                      setHoverCol(colActualTotal);
                                    }}
                                  >
                                    Total
                                  </th>
                                </tr>
                              )}
                            </thead>
                            {filasGrupos.map((grupo, gIdx) => (
                              <tbody key={`fg-${gIdx}`}>
                                {filasGrupos.length > 1 && (
                                  <FilaGrupo
                                    idx={gIdx}
                                    desde={gIdx * GROUP_SIZE}
                                    hasta={Math.min(
                                      (gIdx + 1) * GROUP_SIZE,
                                      filas.length,
                                    )}
                                    total={filas.length}
                                    abierto={filasGrupoSeguro === gIdx}
                                    onClick={() =>
                                      setFilasGrupoAbierto(
                                        filasGrupoSeguro === gIdx ? -1 : gIdx,
                                      )
                                    }
                                    colSpan={totalColsLineaAnio}
                                  />
                                )}
                                {(filasGrupos.length <= 1 ||
                                  filasGrupoSeguro === gIdx) &&
                                  grupo.map((r, rowIdx) => {
                                    const rowCrece = crece(r);
                                    const rowTendencia = tendencia(r);
                                    return (
                                      <tr
                                        key={r.linea}
                                        className="border-t border-zinc-800/60 transition-colors"
                                      >
                                        <td
                                          className={`px-3 py-2 text-zinc-100 whitespace-nowrap cursor-default ${celda(rowIdx, COL_LINEA, rowCrece)}`}
                                          onMouseEnter={() => {
                                            setHoverRow(rowIdx);
                                            setHoverCol(COL_LINEA);
                                          }}
                                        >
                                          {r.linea}
                                        </td>
                                        {desglosado &&
                                          r.anioAnterior.meses
                                            .filter((m) =>
                                              mesesActivos.includes(m.mes),
                                            )
                                            .map((m) => {
                                              const colIdx = colAnteriorMes(
                                                m.mes,
                                              );
                                              return (
                                                <td
                                                  key={`a-${m.mes}`}
                                                  className={`px-2 py-2 text-right tabular-nums text-zinc-400 border-l border-zinc-800/40 cursor-default ${celda(rowIdx, colIdx, rowCrece)}`}
                                                  onMouseEnter={() => {
                                                    setHoverRow(rowIdx);
                                                    setHoverCol(colIdx);
                                                  }}
                                                >
                                                  {valorMes(m) === 0
                                                    ? "—"
                                                    : fmt(valorMes(m))}
                                                </td>
                                              );
                                            })}
                                        <td
                                          className={`px-3 py-2 text-right tabular-nums text-zinc-200 font-medium border-l border-zinc-800 cursor-default ${celda(rowIdx, colAnteriorTotal, rowCrece)}`}
                                          onMouseEnter={() => {
                                            setHoverRow(rowIdx);
                                            setHoverCol(colAnteriorTotal);
                                          }}
                                        >
                                          {fmt(
                                            valor(sumaPeriodo(r.anioAnterior)),
                                          )}
                                        </td>
                                        {desglosado &&
                                          r.anioActual.meses
                                            .filter((m) =>
                                              mesesActivos.includes(m.mes),
                                            )
                                            .map((m) => {
                                              const colIdx = colActualMes(
                                                m.mes,
                                              );
                                              return (
                                                <td
                                                  key={`c-${m.mes}`}
                                                  className={`px-2 py-2 text-right tabular-nums text-zinc-400 border-l border-zinc-800/40 cursor-default ${celda(rowIdx, colIdx, rowCrece)}`}
                                                  onMouseEnter={() => {
                                                    setHoverRow(rowIdx);
                                                    setHoverCol(colIdx);
                                                  }}
                                                >
                                                  {valorMes(m) === 0
                                                    ? "—"
                                                    : fmt(valorMes(m))}
                                                </td>
                                              );
                                            })}
                                        <td
                                          className={`px-3 py-2 text-right tabular-nums text-yellow-400 font-semibold border-l border-zinc-800 cursor-default ${celda(rowIdx, colActualTotal, rowCrece)}`}
                                          onMouseEnter={() => {
                                            setHoverRow(rowIdx);
                                            setHoverCol(colActualTotal);
                                          }}
                                        >
                                          {fmt(
                                            valor(sumaPeriodo(r.anioActual)),
                                          )}
                                        </td>
                                        <td
                                          className={`px-3 py-2 text-center text-base font-bold border-l border-zinc-800 cursor-default ${celdaTendencia(rowTendencia)}`}
                                        >
                                          {iconoTendencia(rowTendencia)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            ))}
                            <tfoot>
                              <tr className="border-t-2 border-zinc-700 bg-zinc-900/60">
                                <td
                                  className={`px-3 py-2 text-zinc-300 font-semibold uppercase text-xs tracking-wide cursor-default ${
                                    hoverCol === COL_LINEA
                                      ? "bg-yellow-400/10"
                                      : ""
                                  }`}
                                  onMouseEnter={() => {
                                    setHoverRow(null);
                                    setHoverCol(COL_LINEA);
                                  }}
                                >
                                  Total
                                </td>
                                {desglosado &&
                                  data!.totales.anioAnterior.meses
                                    .filter((m) => mesesActivos.includes(m.mes))
                                    .map((m) => {
                                      const colIdx = colAnteriorMes(m.mes);
                                      return (
                                        <td
                                          key={`ta-${m.mes}`}
                                          className={`px-2 py-2 text-right tabular-nums text-zinc-300 font-medium border-l border-zinc-800/40 cursor-default ${
                                            hoverCol === colIdx
                                              ? "bg-yellow-400/10"
                                              : ""
                                          }`}
                                          onMouseEnter={() => {
                                            setHoverRow(null);
                                            setHoverCol(colIdx);
                                          }}
                                        >
                                          {fmt(valorMes(m))}
                                        </td>
                                      );
                                    })}
                                <td
                                  className={`px-3 py-2 text-right tabular-nums text-zinc-100 font-bold border-l border-zinc-800 cursor-default ${
                                    hoverCol === colAnteriorTotal
                                      ? "bg-yellow-400/10"
                                      : ""
                                  }`}
                                  onMouseEnter={() => {
                                    setHoverRow(null);
                                    setHoverCol(colAnteriorTotal);
                                  }}
                                >
                                  {fmt(
                                    valor(
                                      sumaPeriodo(data!.totales.anioAnterior),
                                    ),
                                  )}
                                </td>
                                {desglosado &&
                                  data!.totales.anioActual.meses
                                    .filter((m) => mesesActivos.includes(m.mes))
                                    .map((m) => {
                                      const colIdx = colActualMes(m.mes);
                                      return (
                                        <td
                                          key={`tc-${m.mes}`}
                                          className={`px-2 py-2 text-right tabular-nums text-zinc-300 font-medium border-l border-zinc-800/40 cursor-default ${
                                            hoverCol === colIdx
                                              ? "bg-yellow-400/10"
                                              : ""
                                          }`}
                                          onMouseEnter={() => {
                                            setHoverRow(null);
                                            setHoverCol(colIdx);
                                          }}
                                        >
                                          {fmt(valorMes(m))}
                                        </td>
                                      );
                                    })}
                                <td
                                  className={`px-3 py-2 text-right tabular-nums text-yellow-400 font-bold border-l border-zinc-800 cursor-default ${
                                    hoverCol === colActualTotal
                                      ? "bg-yellow-400/10"
                                      : ""
                                  }`}
                                  onMouseEnter={() => {
                                    setHoverRow(null);
                                    setHoverCol(colActualTotal);
                                  }}
                                >
                                  {fmt(
                                    valor(
                                      sumaPeriodo(data!.totales.anioActual),
                                    ),
                                  )}
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-base font-bold border-l border-zinc-800 cursor-default ${celdaTendencia(tendencia(data!.totales))}`}
                                >
                                  {iconoTendencia(tendencia(data!.totales))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {modalMode === "linea" && (
                  <div
                    className={`rounded-xl border border-zinc-800 overflow-hidden transition-opacity ${
                      clientesLineaLoading ? "opacity-50" : ""
                    }`}
                  >
                    <div className="px-5 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-yellow-400 font-bold text-base uppercase tracking-wide">
                          {modalLinea}
                        </h3>
                        <p className="text-zinc-500 text-xs mt-0.5">
                          {clientesLinea
                            ? clientesLinea.desde === clientesLinea.hasta
                              ? `${formatYm(clientesLinea.desde)} (mes actual)`
                              : `${formatYm(clientesLinea.desde)} – ${formatYm(clientesLinea.hasta)} (año en curso)`
                            : "…"}
                        </p>
                      </div>
                      <span className="text-sm text-zinc-500">
                        {clientesLinea
                          ? `${clientesLinea.totalClientes} cliente(s)`
                          : ""}
                      </span>
                    </div>

                    {clientesLineaError && (
                      <div className="px-5 py-4 flex items-center gap-3 text-sm text-red-300">
                        <AlertTriangle size={16} className="text-red-400" />{" "}
                        {clientesLineaError}
                      </div>
                    )}

                    {!clientesLineaError &&
                      !clientesLineaLoading &&
                      (clientesLinea?.porMonto?.length ?? 0) === 0 && (
                        <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
                          <Table2 size={32} className="text-zinc-700" />
                          <p className="text-zinc-500 text-sm">
                            {periodo === "ytd" && mesAnteriorNum < 1
                              ? "Todavía no hay mes anterior este año — probá con \"Meses\" para ver Enero."
                              : "Sin ventas registradas en el rango elegido."}
                          </p>
                        </div>
                      )}

                    {!clientesLineaError &&
                      (clientesLinea?.porMonto?.length ?? 0) > 0 && (
                        // overflow-x-auto (pedido de Pablo 2026-08-18: "que la tabla no
                        // se exceda de la ventana"). Sin min-w-max y con el
                        // nombre truncado (max-w-0 w-full truncate — pedido de
                        // Pablo 2026-08-18: "se sigue escondiendo 3ra
                        // columna"): la tabla ya no necesita scroll horizontal
                        // para mostrar la columna de $, el nombre largo se
                        // corta con "…" en vez de empujarla fuera de la
                        // pantalla.
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-[#1A1A1A] text-zinc-400">
                              <tr>
                                <th className="px-3 py-2 font-medium text-left whitespace-nowrap w-10">
                                  #
                                </th>
                                <th className="px-3 py-2 font-medium text-left">
                                  Cliente
                                </th>
                                <th className="px-3 py-2 font-medium text-right whitespace-nowrap border-l border-zinc-800">
                                  Gasto
                                </th>
                              </tr>
                            </thead>
                            {clientesLineaGrupos.map((grupo, gIdx) => (
                              <tbody key={`cl-${gIdx}`}>
                                {clientesLineaGrupos.length > 1 && (
                                  <FilaGrupo
                                    idx={gIdx}
                                    desde={gIdx * GROUP_SIZE}
                                    hasta={Math.min(
                                      (gIdx + 1) * GROUP_SIZE,
                                      clientesLineaItems.length,
                                    )}
                                    total={clientesLineaItems.length}
                                    abierto={clientesLineaGrupoSeguro === gIdx}
                                    onClick={() =>
                                      setClientesLineaGrupoAbierto(
                                        clientesLineaGrupoSeguro === gIdx
                                          ? -1
                                          : gIdx,
                                      )
                                    }
                                    colSpan={3}
                                  />
                                )}
                                {(clientesLineaGrupos.length <= 1 ||
                                  clientesLineaGrupoSeguro === gIdx) &&
                                  grupo.map((c, i) => (
                                    <tr
                                      key={c.numero}
                                      className="border-t border-zinc-800/60 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                                      onClick={() =>
                                        abrirModalCliente({
                                          numero: c.numero,
                                          nombre: c.nombre,
                                        })
                                      }
                                      title="Ver ventas de este cliente"
                                    >
                                      <td className="px-3 py-2 text-zinc-500 tabular-nums">
                                        {gIdx * GROUP_SIZE + i + 1}
                                      </td>
                                      <td
                                        className="px-3 py-2 text-zinc-100 max-w-0 w-full truncate"
                                        title={c.nombre ?? undefined}
                                      >
                                        {c.nombre ?? "(sin nombre)"}{" "}
                                        <span className="text-zinc-500 font-mono text-xs">
                                          ({c.numero})
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums text-yellow-400 font-semibold border-l border-zinc-800 whitespace-nowrap">
                                        {fmtMoney(c.monto)}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            ))}
                          </table>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rankings del pie — top clientes ($) o top líneas (unidades). El
            título, el botón "Mostrar" y el switch Clientes/Líneas se
            mudaron al header (pedido de Pablo 2026-08-19). El rango es FIJO
            (12 meses terminando en el mes anterior) y lo resuelve el back.
            Clickeando un cliente o una línea de la tabla de abajo se abre
            el modal con el detalle. */}
        {topError && (
          <div className="rounded-xl border border-red-400/40 bg-zinc-900/40 px-5 py-4 flex items-center gap-3 text-sm text-red-300">
            <AlertTriangle size={16} className="text-red-400" /> {topError}
          </div>
        )}

        {!topError && (
          <div
            className={`rounded-xl border border-zinc-800 overflow-hidden transition-opacity ${topLoading ? "opacity-50" : ""}`}
          >
            {(() => {
              const vacio =
                topVista === "clientes"
                  ? !topClientes?.porMonto?.length
                  : !topLineas?.porUnidades?.length;
              if (!topLoading && vacio) {
                return (
                  <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
                    <Trophy size={32} className="text-zinc-700" />
                    <p className="text-zinc-500 text-sm">
                      Sin ventas registradas en el rango elegido.
                    </p>
                  </div>
                );
              }
              return (
                <>
                  {/* overflow-x-auto (pedido de Pablo 2026-08-18: "que la tabla no se
                exceda de la ventana"). Sin min-w-max y con la columna de
                nombre truncada (max-w-0 w-full truncate — pedido de Pablo
                2026-08-18: "se sigue escondiendo 3ra columna"): la tabla
                ya no necesita scroll horizontal para mostrar la columna
                de $/unidades, el nombre largo se corta con "…" en vez de
                empujarla fuera de la pantalla. */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#1A1A1A] text-zinc-400">
                        <tr>
                          <th className="px-3 py-2 font-medium text-left whitespace-nowrap w-10">
                            #
                          </th>
                          <th className="px-3 py-2 font-medium text-left whitespace-nowrap">
                            {topVista === "clientes" ? "Cliente" : "Línea"}
                          </th>
                          <th className="px-3 py-2 font-medium text-right whitespace-nowrap border-l border-zinc-800">
                            {topVista === "clientes" ? "Pesos" : "Unidades"}
                          </th>
                        </tr>
                      </thead>
                      {topGrupos.map((grupo, gIdx) => (
                        <tbody key={`top-${gIdx}`}>
                          {topGrupos.length > 1 && (
                            <FilaGrupo
                              idx={gIdx}
                              desde={gIdx * GROUP_SIZE}
                              hasta={Math.min(
                                (gIdx + 1) * GROUP_SIZE,
                                topItems.length,
                              )}
                              total={topItems.length}
                              abierto={topGrupoSeguro === gIdx}
                              onClick={() =>
                                setTopGrupoAbierto(
                                  topGrupoSeguro === gIdx ? -1 : gIdx,
                                )
                              }
                              colSpan={3}
                            />
                          )}
                          {(topGrupos.length <= 1 || topGrupoSeguro === gIdx) &&
                            (topVista === "clientes"
                              ? (grupo as TopCliente[]).map((c, i) => (
                                  <tr
                                    key={c.numero}
                                    className="border-t border-zinc-800/60 hover:bg-zinc-800/30 transition-colors"
                                  >
                                    <td className="px-3 py-2 text-zinc-500 tabular-nums">
                                      {gIdx * GROUP_SIZE + i + 1}
                                    </td>
                                    <td
                                      className="px-3 py-2 text-zinc-100 max-w-0 w-full truncate"
                                      title={c.nombre ?? undefined}
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          abrirModalCliente({
                                            numero: c.numero,
                                            nombre: c.nombre,
                                          })
                                        }
                                        className="hover:text-yellow-400 hover:underline transition-colors text-left"
                                        title="Ver ventas de este cliente"
                                      >
                                        {c.nombre ?? "(sin nombre)"}
                                      </button>{" "}
                                      <span className="text-zinc-500 font-mono text-xs">
                                        ({c.numero})
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-yellow-400 font-semibold border-l border-zinc-800 whitespace-nowrap">
                                      {fmtTop(c.monto)}
                                    </td>
                                  </tr>
                                ))
                              : (grupo as TopLinea[]).map((l, i) => (
                                  <tr
                                    key={l.linea}
                                    className="border-t border-zinc-800/60 hover:bg-zinc-800/30 transition-colors"
                                  >
                                    <td className="px-3 py-2 text-zinc-500 tabular-nums">
                                      {gIdx * GROUP_SIZE + i + 1}
                                    </td>
                                    <td
                                      className="px-3 py-2 text-zinc-100 max-w-0 w-full truncate"
                                      title={l.linea}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => abrirModalLinea(l.linea)}
                                        className="hover:text-yellow-400 hover:underline transition-colors text-left"
                                        title="Ver clientes que compraron esta línea"
                                        onChange={(e) => {
                                          setQCliente("");
                                          setClienteSel(null);
                                        }}
                                      >
                                        {l.linea}
                                      </button>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-yellow-400 font-semibold border-l border-zinc-800 whitespace-nowrap">
                                      {fmtTop(l.unidades)}
                                    </td>
                                  </tr>
                                )))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
