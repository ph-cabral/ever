"""
Total de pedidos de venta del mes (Magnus, SOLO LECTURA).

Para /compras/metricas: denominador contra el que se compara el total de
faltantes del mes (unidades y $) — "cuánto representa lo que faltó sobre el
total pedido ese mes" (pedido 2026-07-28, Pablo). Reusa el mismo criterio de
"pedido válido" que ya usa deposito.py/main.py (_es_valido: Estado
Cerrado/Facturado, blacklist de CompCodigo) para no contar comprobantes que
no son pedidos reales — mismos valores confirmados 2026-07-10 (ver
deposito.py).

Tablas (EVERWEAR, confirmadas por deposito.py/main.py):
  · VenFer_PedidoCabecera → NroMovVenta, FechaPedido (int, días desde
    1800-12-28), CompCodigo, EstadoPedido
  · VenFer_PedidoReng     → NroMovVenta, CodArticu, CantidadPedida,
    PrecioVenta
  · Pedido_Estados (MAGNUS_SITD) → Ped_Estado, Ped_EstadoDescripcion
"""
from datetime import datetime, date
from decimal import Decimal
import calendar
import re
import time
from db import get_connection
from clientes import fetch_cliente, fetch_vendedor_fijo_cliente

BASE_DATE = date(1800, 12, 28)  # Magnus guarda fechas como días desde esta base

# Mismo blacklist que COMP_CODIGOS_EXCLUIDOS_HORA (deposito.py) y SQL_QUERY
# (main.py): comprobantes que no son pedidos de venta reales.
COMP_CODIGOS_EXCLUIDOS = (9, 49, 208, 410)
# Mismo whitelist que _es_valido (deposito.py): solo pedidos ya Cerrados o
# Facturados cuentan como "pedido real" del mes (no Abiertos/Cancelados).
ESTADOS_VALIDOS = ("CERRADO", "FACTURADO")
PATRONES_CANCELADO = ("CANCEL",)


def _es_valido(estado_desc) -> bool:
    s = str(estado_desc or "").upper()
    if any(p in s for p in PATRONES_CANCELADO):
        return False
    return any(p in s for p in ESTADOS_VALIDOS)


def _safe(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return value


SQL_PEDIDOS_RANGO = """
SELECT cab.NroMovVenta, cab.CompCodigo, est.Ped_EstadoDescripcion AS Estado
FROM EVERWEAR.dbo.VenFer_PedidoCabecera cab
LEFT JOIN MAGNUS_SITD.dbo.Pedido_Estados est ON cab.EstadoPedido = est.Ped_Estado
WHERE cab.FechaPedido BETWEEN ? AND ?
"""

SQL_RENGLONES = """
SELECT
    SUM(r.CantidadPedida)                 AS TotalUnidades,
    SUM(r.CantidadPedida * r.PrecioVenta) AS TotalImporte
FROM EVERWEAR.dbo.VenFer_PedidoReng r
WHERE r.NroMovVenta IN ({ph})
"""


def fetch_pedidos_mes(desde: str, hasta: str) -> dict:
    """Total de unidades y $ pedidos (solo pedidos válidos: Cerrado/Facturado,
    sin comprobantes de la blacklist) con FechaPedido en [desde, hasta].

    Para el % de faltantes/total del mes en /compras/metricas — no filtra por
    artículo, es el total de TODO lo pedido en el mes (hayan faltado o no)."""
    d1 = datetime.strptime(str(desde)[:10], "%Y-%m-%d").date()
    d2 = datetime.strptime(str(hasta)[:10], "%Y-%m-%d").date()
    d1n = (d1 - BASE_DATE).days
    d2n = (d2 - BASE_DATE).days

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_PEDIDOS_RANGO, (d1n, d2n))
        colps = [c[0] for c in cur.description]
        pedidos_validos: set[int] = set()
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            try:
                comp = int(d.get("CompCodigo")) if d.get("CompCodigo") is not None else None
            except (TypeError, ValueError):
                comp = None
            if comp in COMP_CODIGOS_EXCLUIDOS:
                continue
            if not _es_valido(d.get("Estado")):
                continue
            nro = d.get("NroMovVenta")
            if nro is not None:
                pedidos_validos.add(int(nro))

        total_unidades = 0.0
        total_importe = 0.0
        CH = 1000
        pedidos_lista = sorted(pedidos_validos)
        for i in range(0, len(pedidos_lista), CH):
            chunk = pedidos_lista[i:i + CH]
            ph = ",".join("?" for _ in chunk)
            cur.execute(SQL_RENGLONES.format(ph=ph), chunk)
            row = cur.fetchone()
            if row:
                total_unidades += float(_safe(row[0]) or 0)
                total_importe += float(_safe(row[1]) or 0)

        return {
            "desde": d1.isoformat(),
            "hasta": d2.isoformat(),
            "pedidos": len(pedidos_lista),
            "totalUnidades": round(total_unidades, 2),
            "totalImporte": round(total_importe, 2),
        }
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────────────────
# Ventas por línea de un cliente — /ventas/vendedor (pedido de Pablo
# 2026-08-14): vista con filtro de cliente (código/nombre), tabla líneas x
# año actual/anterior (con desglose mensual opcional) y switch
# unidades/pesos.
#
# Fuente y criterio de "venta neta" — MISMOS que ya se verificaron a mano
# contra el pivot Excel real (ver HANDOFF_extracciones_sql.md,
# extraccion_ventas_todos_C00.py, ver_sp_ventas_hechos.py → SP
# _VEN_01_REAL_Ventas_Hechos): Ven_CompCabecera + Ven_CompRenglon
# (comprobantes REALES, no pedidos), cantidad/monto NETOS de nota de crédito
# según Ven_CodCom.DebitoCredito (1=Débito suma, 2=Crédito resta), filtro
# cc.EvitaInformesYListados <> 1, mes = FecMovim del COMPROBANTE vía
# dbo.fecha_cla2sql() (no FechaPedido del pedido — ver nota en el HANDOFF de
# por qué esto importa: un pedido de un mes facturado al siguiente cae en el
# mes de la factura).
#
# Línea = StkFer_ArtParamet.Nivel1 (mismo campo que ya usa /compras/consumo y
# /deposito/faltantes), vía StkFer_Articulos.ArticuloPatron.
#
# Gotcha fecha (ver HANDOFF): NO se filtra por fecha en el SQL (comparar una
# fecha calculada con dbo.fecha_cla2sql() contra un parámetro de fecha no
# filtra bien con el driver viejo, se pierden filas sin error). Acá se filtra
# por CodCliente en el WHERE (columna simple, sí filtra bien) — se trae TODO
# el historial de ESE cliente y se agrupa por año/mes en Python.
MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
SIN_LINEA = "(Sin línea)"

SQL_VENTAS_CLIENTE = """
SELECT
    LTRIM(RTRIM(ap.Nivel1)) AS Linea,
    dbo.fecha_cla2sql(c.FecMovim) AS Fecha,
    cc.EvitaInformesYListados AS Evita,
    CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE r.Cantidad * -1 END AS CantidadNeta,
    CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END AS MontoNeto
FROM Ven_CompCabecera c
JOIN Ven_CompRenglon r ON r.NroMovVenta = c.NroMovVenta
JOIN Ven_CodCom cc      ON c.CompCodigo = cc.CompCodigo
LEFT JOIN StkFer_Articulos  s  ON s.CodArticulo     = r.CodArticu
LEFT JOIN StkFer_ArtParamet ap ON ap.ArticuloPatron = s.ArticuloPatron
WHERE c.CodCliente = ?
"""

# Vendedores (Magnus) — para el selector de "vendedorCodigo" de
# /admin/usuarios (pedido de Pablo 2026-08-14, acceso por vendedor).
SQL_VENDEDORES = """
SELECT Usu_Arma_Codigo AS codigo, LTRIM(RTRIM(Usu_Arma_Nombre)) AS nombre
FROM MAGNUS_SITD.dbo.Ped_Usu_Arma
ORDER BY Usu_Arma_Nombre
"""


def fetch_vendedores() -> list[dict]:
    """Lista de vendedores {'codigo', 'nombre'} desde Magnus
    (Ped_Usu_Arma) — catálogo chico, sin paginar."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_VENDEDORES)
        out = []
        for cod, nombre in cur.fetchall():
            if cod is None:
                continue
            out.append({"codigo": int(cod), "nombre": (str(nombre).strip() if nombre else None)})
        return out
    finally:
        conn.close()


def _anio_vacio() -> dict:
    return {
        "cantidad": 0.0,
        "monto": 0.0,
        "meses": [{"mes": m, "label": MESES_ES[m - 1], "cantidad": 0.0, "monto": 0.0} for m in range(1, 13)],
    }


def _round_anio(a: dict) -> dict:
    a["cantidad"] = round(a["cantidad"], 2)
    a["monto"] = round(a["monto"], 2)
    for m in a["meses"]:
        m["cantidad"] = round(m["cantidad"], 2)
        m["monto"] = round(m["monto"], 2)
    return a


def _bloqueado(cod_cliente: int, anio_anterior: int, anio_actual: int) -> dict:
    """Respuesta para un cliente que NO corresponde al vendedor logueado —
    a propósito no incluye nombre del cliente ni ningún número (ver
    docstring de fetch_ventas_por_linea): esto es el chequeo de defensa en
    profundidad server-side, no debería alcanzarse en uso normal (el
    buscador de clientes ya filtra antes), pero si alguien arma la URL a
    mano con un `cliente=` ajeno no tiene que filtrar nada."""
    return {
        "cliente": {"codigo": int(cod_cliente), "nombre": None},
        "anioAnterior": anio_anterior,
        "anioActual": anio_actual,
        "tieneDatos": False,
        "permitido": False,
        "lineas": [],
        "totales": {"anioAnterior": _anio_vacio(), "anioActual": _anio_vacio()},
    }


# ──────────────────────────────────────────────────────────────────────────
# Rankings del pie de /ventas/vendedor — top clientes ($) y top líneas
# (unidades) en un rango de meses. Ambos toman SOLO los clientes que ya
# pasan el mismo filtro de acceso por vendedor que usa el buscador de
# clientes (fetch_clientes_search/SQL_CLIENTES_SEARCH_POR_VENDEDOR) — un
# no-admin nunca ve acá un cliente que no es suyo. Admin (`vendedor=None`)
# ve el ranking de toda la empresa.
#
# RANGO (pedido de Pablo 2026-08-18): ventana FIJA de 12 meses que termina
# en el MES ANTERIOR al actual — el mes en curso queda afuera por estar
# incompleto. En agosto 2026 eso es agosto 2025 → julio 2026. El front ya
# no manda `desde`/`hasta` ni deja elegir el rango; los parámetros siguen
# existiendo en la ruta HTTP solo para debug.
#
# FILTRO DE FECHA EN SQL (pedido de Pablo 2026-08-18, "todo el trabajo
# debe ser en sql porque se ralentiza mucho la consulta"): ahora el rango
# se recorta en el WHERE, no en Python. El filtro va contra la COLUMNA
# CRUDA `vc.FecMovim` — entero base 1800-12-28, igual que FechaPedido en
# fetch_pedidos_mes (ver HANDOFF_extracciones_sql.md: "las tablas Magnus
# usan fecha entera base 1800-12-28") — y NO contra
# `dbo.fecha_cla2sql(vc.FecMovim)`. Esto importa por dos razones:
#
#   1. Esquiva el gotcha ya documentado del driver viejo (comparar una
#      fecha CALCULADA contra un parámetro de FECHA se come filas sin
#      tirar error). Acá los dos lados son enteros, no fechas.
#   2. Es sargable: sin UDF escalar por fila, el motor puede usar índice
#      sobre FecMovim. Un `WHERE YEAR(dbo.fecha_cla2sql(...)) = ?` habría
#      forzado igual el scan completo + una llamada a la UDF por renglón,
#      o sea el problema de velocidad que Pablo pidió arreglar.
#
# Si `FecMovim` no fuera ese entero, esta query falla RUIDOSAMENTE (error
# de conversión o cero filas), no en silencio — que es justo lo contrario
# del gotcha de arriba, y por eso es una apuesta segura.
#
# La suma se hace entera en SQL (GROUP BY por cliente / por línea, ya sin
# desglose año-mes: nada de lo que se traía a Python se usaba para otra
# cosa que sumar). Además cada resultado se cachea en memoria por 15 min
# — el front pide esto al montar la página o al cambiar el rango, no hace
# falta que sea al segundo. Cache simple de proceso (uvicorn con 1 worker,
# ver main.py); con más workers cada uno cachea por su lado, lo cual sigue
# siendo correcto, solo menos efectivo.
# Largo de la ventana, en meses. Fijo — no es configurable desde la vista.
TOP_MESES = 12

_TOP_CLIENTES_CACHE: dict[tuple, tuple[float, dict]] = {}
_TOP_CLIENTES_TTL_SEG = 15 * 60  # 15 minutos

_TOP_LINEAS_CACHE: dict[tuple, tuple[float, dict]] = {}
_TOP_LINEAS_TTL_SEG = 15 * 60  # 15 minutos

_YM_RE = re.compile(r"^(\d{4})-(\d{1,2})$")


def _parse_ym(s: str) -> tuple[int, int]:
    """'YYYY-MM' -> (año, mes). ValueError si no matchea o el mes no es
    1..12 — se propaga tal cual (el caller/ruta HTTP lo envuelve)."""
    m = _YM_RE.match((s or "").strip())
    if not m:
        raise ValueError(f"Formato de mes inválido: {s!r} (esperado YYYY-MM)")
    anio, mes = int(m.group(1)), int(m.group(2))
    if not (1 <= mes <= 12):
        raise ValueError(f"Mes inválido: {s!r}")
    return anio, mes


def _mes_atras(ym: tuple[int, int], n: int) -> tuple[int, int]:
    """(año, mes) que queda `n` meses antes de `ym`."""
    anio, mes = ym
    idx = anio * 12 + (mes - 1) - n
    return idx // 12, idx % 12 + 1


def _resolver_rango(desde: str | None, hasta: str | None, meses: int = TOP_MESES):
    """('YYYY-MM'|None, 'YYYY-MM'|None) -> (desde_ym, hasta_ym, dia_desde,
    dia_hasta), donde los `dia_*` son el entero Magnus (días desde
    BASE_DATE) del PRIMER día del mes `desde` y del ÚLTIMO día del mes
    `hasta` — o sea, ambos meses quedan incluidos completos.

    Default (pedido de Pablo 2026-08-18): ventana FIJA de `meses` meses que
    termina en el MES ANTERIOR al actual — el mes en curso NO entra porque
    está incompleto. Corriendo en agosto 2026 da agosto 2025 → julio 2026.

    `desde`/`hasta` explícitos siguen andando (la ruta HTTP los expone para
    debug y consultas puntuales), pero el front ya no los manda: la vista
    usa siempre la ventana fija. Si vienen invertidos se reordenan. Lanza
    ValueError si el formato no es 'YYYY-MM'."""
    hoy_ym = (date.today().year, date.today().month)
    hasta_ym = _parse_ym(hasta) if hasta else _mes_atras(hoy_ym, 1)
    desde_ym = _parse_ym(desde) if desde else _mes_atras(hasta_ym, meses - 1)
    if desde_ym > hasta_ym:
        desde_ym, hasta_ym = hasta_ym, desde_ym

    primer_dia = date(desde_ym[0], desde_ym[1], 1)
    ultimo_dia = date(
        hasta_ym[0], hasta_ym[1], calendar.monthrange(hasta_ym[0], hasta_ym[1])[1]
    )
    return desde_ym, hasta_ym, (primer_dia - BASE_DATE).days, (ultimo_dia - BASE_DATE).days


SQL_TOP_CLIENTES_VENDEDOR = """
SELECT
    c.CodCliente AS CodCliente,
    LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) AS MontoNeto
FROM MAGNUS_SITD.dbo.Clientes c
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz ON vz.Clasif_VendZona = c.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma pu  ON LTRIM(RTRIM(pu.Usu_Arma_Nombre)) = LTRIM(RTRIM(vz.Vendedor))
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
WHERE pu.Usu_Arma_Codigo = ?
  AND cc.EvitaInformesYListados <> 1
  AND vc.FecMovim BETWEEN ? AND ?
GROUP BY c.CodCliente, LTRIM(RTRIM(c.Cliente_Nombre))
HAVING SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) > 0
ORDER BY MontoNeto DESC
"""

SQL_TOP_CLIENTES_TODOS = """
SELECT
    c.CodCliente AS CodCliente,
    LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) AS MontoNeto
FROM MAGNUS_SITD.dbo.Clientes c
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
WHERE cc.EvitaInformesYListados <> 1
  AND vc.FecMovim BETWEEN ? AND ?
GROUP BY c.CodCliente, LTRIM(RTRIM(c.Cliente_Nombre))
HAVING SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) > 0
ORDER BY MontoNeto DESC
"""


def fetch_top_clientes(
    vendedor: int | None = None,
    limit: int = 10000,
    desde: str | None = None,
    hasta: str | None = None,
    forzar: bool = False,
) -> dict:
    """Top clientes por MONTO (venta neta, $) en un rango de meses — para el
    ranking debajo de la tabla de /ventas/vendedor.

    Devuelve `porMonto` (las `limit` primeras, ya ordenadas por SQL) y
    `totalClientes` (pedido de Pablo 2026-08-18: cuántos clientes distintos
    entran en la filtración, NO cuántos se muestran — o sea, el total puede
    ser mucho mayor que len(porMonto)).

    Solo $: el ranking por unidades se sacó a propósito (pedido de Pablo
    2026-08-18, "acá solo dejamos ver $ gastado por ese cliente"). Las
    unidades ahora viven en fetch_top_lineas.

    `vendedor`: mismo criterio de acceso que fetch_clientes_search — si se
    pasa, el ranking sale SOLO de los clientes cuyo "Vendedor por Defecto"
    fijo es ese código (JOIN Clientes→Vendedor_Zona→Ped_Usu_Arma en la
    MISMA consulta). `None` (admin) no filtra, ranking de toda la empresa.

    `desde`/`hasta` ("YYYY-MM"): rango de meses, AMBOS inclusive y
    completos. Default: ventana fija de TOP_MESES (12) meses terminando en
    el MES ANTERIOR al actual — ver _resolver_rango. No respeta el selector
    de período (YTD/meses) de la tabla principal. Lanza `ValueError` si el
    formato no es "YYYY-MM".

    `forzar=True` ignora el cache (para refrescar a mano sin esperar el
    TTL — no expuesto en la ruta HTTP, pensado para debug)."""
    desde_ym, hasta_ym, dia_desde, dia_hasta = _resolver_rango(desde, hasta)

    limit_i = max(1, int(limit or 10))
    cache_key = (vendedor, limit_i, desde_ym, hasta_ym)
    ahora = time.monotonic()
    if not forzar:
        cacheado = _TOP_CLIENTES_CACHE.get(cache_key)
        if cacheado is not None and (ahora - cacheado[0]) < _TOP_CLIENTES_TTL_SEG:
            return cacheado[1]

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        if vendedor is None:
            cur.execute(SQL_TOP_CLIENTES_TODOS, (dia_desde, dia_hasta))
        else:
            cur.execute(SQL_TOP_CLIENTES_VENDEDOR, (int(vendedor), dia_desde, dia_hasta))

        clientes: list[dict] = []
        for cod, nombre, monto in cur.fetchall():
            if cod is None:
                continue
            clientes.append(
                {
                    "numero": int(cod),
                    "nombre": (str(nombre).strip() if nombre else None),
                    "monto": round(float(_safe(monto) or 0), 2),
                }
            )

        resultado = {
            "desde": f"{desde_ym[0]:04d}-{desde_ym[1]:02d}",
            "hasta": f"{hasta_ym[0]:04d}-{hasta_ym[1]:02d}",
            "totalClientes": len(clientes),
            "porMonto": clientes[:limit_i],
        }
        _TOP_CLIENTES_CACHE[cache_key] = (ahora, resultado)
        return resultado
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────────────────
# Top líneas (pedido de Pablo 2026-08-18: "agregamos vista de líneas, al
# igual que el top, traemos el total de líneas y acá dejamos ver solo
# unidades compradas"). Línea = StkFer_ArtParamet.Nivel1 — el mismo campo
# que ya usan la tabla principal de esta vista, /compras/consumo y
# /deposito/faltantes; es texto libre y ES el nombre de la línea (POLEAS,
# CORREAS, …), no un código a resolver aparte (ver compras.fetch_lineas).
#
# El JOIN a artículo/parámetros es LEFT a propósito: un renglón cuyo
# artículo no está en el catálogo no se pierde, cae en SIN_LINEA. Por eso
# el "> 0" va en Python y no en un HAVING — hay que consolidar el grupo
# NULL con el grupo '' antes de decidir si la línea entra.
SQL_TOP_LINEAS_VENDEDOR = """
SELECT
    LTRIM(RTRIM(ap.Nivel1)) AS Linea,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE r.Cantidad * -1 END) AS UnidadesNetas
FROM MAGNUS_SITD.dbo.Clientes c
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz ON vz.Clasif_VendZona = c.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma pu  ON LTRIM(RTRIM(pu.Usu_Arma_Nombre)) = LTRIM(RTRIM(vz.Vendedor))
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
LEFT JOIN StkFer_Articulos  s  ON s.CodArticulo    = r.CodArticu
LEFT JOIN StkFer_ArtParamet ap ON ap.ArticuloPatron = s.ArticuloPatron
WHERE pu.Usu_Arma_Codigo = ?
  AND cc.EvitaInformesYListados <> 1
  AND vc.FecMovim BETWEEN ? AND ?
GROUP BY LTRIM(RTRIM(ap.Nivel1))
"""

SQL_TOP_LINEAS_TODOS = """
SELECT
    LTRIM(RTRIM(ap.Nivel1)) AS Linea,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE r.Cantidad * -1 END) AS UnidadesNetas
FROM Ven_CompCabecera vc
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
LEFT JOIN StkFer_Articulos  s  ON s.CodArticulo    = r.CodArticu
LEFT JOIN StkFer_ArtParamet ap ON ap.ArticuloPatron = s.ArticuloPatron
WHERE cc.EvitaInformesYListados <> 1
  AND vc.FecMovim BETWEEN ? AND ?
GROUP BY LTRIM(RTRIM(ap.Nivel1))
"""


def fetch_top_lineas(
    vendedor: int | None = None,
    limit: int = 10000,
    desde: str | None = None,
    hasta: str | None = None,
    forzar: bool = False,
) -> dict:
    """Top líneas por UNIDADES compradas en un rango de meses — gemelo de
    fetch_top_clientes, mismo rango/cache/criterio de acceso por vendedor,
    pero agrupando por línea de artículo en vez de por cliente.

    Devuelve `porUnidades` (las `limit` primeras) y `totalLineas` (cuántas
    líneas distintas entran en la filtración, no cuántas se muestran).
    Solo unidades — el $ vive en fetch_top_clientes."""
    desde_ym, hasta_ym, dia_desde, dia_hasta = _resolver_rango(desde, hasta)

    limit_i = max(1, int(limit or 10))
    cache_key = (vendedor, limit_i, desde_ym, hasta_ym)
    ahora = time.monotonic()
    if not forzar:
        cacheado = _TOP_LINEAS_CACHE.get(cache_key)
        if cacheado is not None and (ahora - cacheado[0]) < _TOP_LINEAS_TTL_SEG:
            return cacheado[1]

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        if vendedor is None:
            cur.execute(SQL_TOP_LINEAS_TODOS, (dia_desde, dia_hasta))
        else:
            cur.execute(SQL_TOP_LINEAS_VENDEDOR, (int(vendedor), dia_desde, dia_hasta))

        # NULL y '' son grupos distintos para SQL pero la misma "sin línea"
        # acá, así que se consolidan antes de filtrar/ordenar.
        acumulado: dict[str, float] = {}
        for linea, unidades in cur.fetchall():
            nombre = (str(linea or "")).strip() or SIN_LINEA
            acumulado[nombre] = acumulado.get(nombre, 0.0) + float(_safe(unidades) or 0)

        lineas = [
            {"linea": nombre, "unidades": round(u, 2)}
            for nombre, u in acumulado.items()
            if u > 0
        ]
        lineas.sort(key=lambda x: x["unidades"], reverse=True)

        resultado = {
            "desde": f"{desde_ym[0]:04d}-{desde_ym[1]:02d}",
            "hasta": f"{hasta_ym[0]:04d}-{hasta_ym[1]:02d}",
            "totalLineas": len(lineas),
            "porUnidades": lineas[:limit_i],
        }
        _TOP_LINEAS_CACHE[cache_key] = (ahora, resultado)
        return resultado
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────────────────
# Clientes por línea — /ventas/vendedor/clientes-por-linea (pedido de Pablo
# 2026-08-18: al hacer click en una línea del ranking "Top líneas", el
# modal de /ventas/vendedor tiene que mostrar los CLIENTES que compraron esa
# línea, ordenados de mayor a menor por $ gastado). Gemelo de
# fetch_top_clientes: mismo rango fijo (_resolver_rango), mismo cache 15
# min, mismo criterio de acceso por vendedor — lo único que cambia es que
# acá se agrega un filtro por línea de artículo (ap.Nivel1) al WHERE/JOIN
# que ya usa fetch_top_clientes.
#
# `linea == SIN_LINEA` es un caso especial: no hay ningún valor de
# ap.Nivel1 literal "(Sin línea)" en la base, ese texto lo arma
# fetch_top_lineas en Python para consolidar NULL y '' — así que acá, para
# ese caso, el filtro es "sin línea" (IS NULL o vacío) en vez de una
# comparación exacta de string.
_TOP_CLIENTES_LINEA_CACHE: dict[tuple, tuple[float, dict]] = {}
_TOP_CLIENTES_LINEA_TTL_SEG = 15 * 60  # 15 minutos

SQL_CLIENTES_LINEA_VENDEDOR_TPL = """
SELECT
    c.CodCliente AS CodCliente,
    LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) AS MontoNeto
FROM MAGNUS_SITD.dbo.Clientes c
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz ON vz.Clasif_VendZona = c.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma pu  ON LTRIM(RTRIM(pu.Usu_Arma_Nombre)) = LTRIM(RTRIM(vz.Vendedor))
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
LEFT JOIN StkFer_Articulos  s  ON s.CodArticulo    = r.CodArticu
LEFT JOIN StkFer_ArtParamet ap ON ap.ArticuloPatron = s.ArticuloPatron
WHERE pu.Usu_Arma_Codigo = ?
  AND cc.EvitaInformesYListados <> 1
  AND vc.FecMovim BETWEEN ? AND ?
  AND {linea_cond}
GROUP BY c.CodCliente, LTRIM(RTRIM(c.Cliente_Nombre))
HAVING SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) > 0
ORDER BY MontoNeto DESC
"""

SQL_CLIENTES_LINEA_TODOS_TPL = """
SELECT
    c.CodCliente AS CodCliente,
    LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) AS MontoNeto
FROM MAGNUS_SITD.dbo.Clientes c
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
LEFT JOIN StkFer_Articulos  s  ON s.CodArticulo    = r.CodArticu
LEFT JOIN StkFer_ArtParamet ap ON ap.ArticuloPatron = s.ArticuloPatron
WHERE cc.EvitaInformesYListados <> 1
  AND vc.FecMovim BETWEEN ? AND ?
  AND {linea_cond}
GROUP BY c.CodCliente, LTRIM(RTRIM(c.Cliente_Nombre))
HAVING SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) > 0
ORDER BY MontoNeto DESC
"""

_LINEA_COND_EXACTA = "LTRIM(RTRIM(ap.Nivel1)) = ?"
_LINEA_COND_SIN_LINEA = "(ap.Nivel1 IS NULL OR LTRIM(RTRIM(ap.Nivel1)) = '')"


def fetch_clientes_por_linea(
    linea: str,
    vendedor: int | None = None,
    limit: int = 10000,
    desde: str | None = None,
    hasta: str | None = None,
    forzar: bool = False,
) -> dict:
    """Clientes que compraron una línea de artículo, ordenados por MONTO
    (venta neta, $) de mayor a menor, en el mismo rango fijo de 12 meses que
    fetch_top_clientes/fetch_top_lineas — para el modal de
    /ventas/vendedor cuando se hace click en una línea del ranking "Top líneas".

    Devuelve `porMonto` (las `limit` primeras, ya ordenadas por SQL) y
    `totalClientes` (cuántos clientes distintos compraron esa línea en el
    rango, no cuántos se muestran).

    `linea`: nombre de línea tal cual lo devuelve fetch_top_lineas
    (ap.Nivel1 trimeado) — o SIN_LINEA, caso especial que no compara texto
    sino que filtra Nivel1 NULL/''.

    `vendedor`: mismo criterio de acceso que fetch_top_clientes — si se
    pasa, solo clientes de la cartera de ese vendedor."""
    desde_ym, hasta_ym, dia_desde, dia_hasta = _resolver_rango(desde, hasta)

    linea_norm = (linea or "").strip()
    if not linea_norm:
        raise ValueError("Falta 'linea'")

    limit_i = max(1, int(limit or 100))
    cache_key = (linea_norm, vendedor, limit_i, desde_ym, hasta_ym)
    ahora = time.monotonic()
    if not forzar:
        cacheado = _TOP_CLIENTES_LINEA_CACHE.get(cache_key)
        if cacheado is not None and (ahora - cacheado[0]) < _TOP_CLIENTES_LINEA_TTL_SEG:
            return cacheado[1]

    es_sin_linea = linea_norm == SIN_LINEA
    linea_cond = _LINEA_COND_SIN_LINEA if es_sin_linea else _LINEA_COND_EXACTA

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        if vendedor is None:
            sql = SQL_CLIENTES_LINEA_TODOS_TPL.format(linea_cond=linea_cond)
            params = (dia_desde, dia_hasta) if es_sin_linea else (dia_desde, dia_hasta, linea_norm)
        else:
            sql = SQL_CLIENTES_LINEA_VENDEDOR_TPL.format(linea_cond=linea_cond)
            params = (
                (int(vendedor), dia_desde, dia_hasta)
                if es_sin_linea
                else (int(vendedor), dia_desde, dia_hasta, linea_norm)
            )
        cur.execute(sql, params)

        clientes: list[dict] = []
        for cod, nombre, monto in cur.fetchall():
            if cod is None:
                continue
            clientes.append(
                {
                    "numero": int(cod),
                    "nombre": (str(nombre).strip() if nombre else None),
                    "monto": round(float(_safe(monto) or 0), 2),
                }
            )

        resultado = {
            "linea": linea_norm,
            "desde": f"{desde_ym[0]:04d}-{desde_ym[1]:02d}",
            "hasta": f"{hasta_ym[0]:04d}-{hasta_ym[1]:02d}",
            "totalClientes": len(clientes),
            "porMonto": clientes[:limit_i],
        }
        _TOP_CLIENTES_LINEA_CACHE[cache_key] = (ahora, resultado)
        return resultado
    finally:
        conn.close()


def fetch_ventas_por_linea(cod_cliente: int, vendedor: int | None = None) -> dict:
    """Ventas (cantidad neta y monto neto) de UN cliente, agrupadas por línea
    de artículo y por año actual/año anterior, con desglose mensual — para
    /ventas/vendedor. Ver docstring del módulo (arriba) para la fuente y el
    criterio de "venta neta".

    `vendedor` (pedido de Pablo 2026-08-14, acceso por vendedor): si se
    pasa, se resuelve el "Vendedor por Defecto" FIJO de ESTE cliente (ver
    clientes.fetch_vendedor_fijo_cliente — maestro Magnus, Clientes.
    Clasif_VendZona → Vendedor_Zona → Ped_Usu_Arma, confirmado 2026-08-14;
    reemplaza el criterio anterior de "vendedor más frecuente en el
    historial", que podía no coincidir con el mismo filtro ya aplicado en
    /clientes) y, si no coincide, se devuelve `_bloqueado(...)` SIN calcular
    ni filtrar/agrupar nada más — nunca se arma `lineas`/`totales` reales
    para un cliente ajeno. `None` (admin) no filtra nada, mismo
    comportamiento que antes."""
    hoy = date.today()
    anio_actual = hoy.year
    anio_anterior = anio_actual - 1

    if vendedor is not None:
        principal = fetch_vendedor_fijo_cliente(cod_cliente)
        if principal != int(vendedor):
            return _bloqueado(cod_cliente, anio_anterior, anio_actual)

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_VENTAS_CLIENTE, (int(cod_cliente),))
        cols = [c[0] for c in cur.description]
        filas = cur.fetchall()

        lineas: dict[str, dict] = {}
        tot_anterior = _anio_vacio()
        tot_actual = _anio_vacio()
        tiene_datos = False

        for row in filas:
            d = dict(zip(cols, row))
            try:
                evita = int(d.get("Evita")) if d.get("Evita") is not None else 0
            except (TypeError, ValueError):
                evita = 0
            if evita == 1:
                continue
            fecha = d.get("Fecha")
            if fecha is None:
                continue
            anio = fecha.year
            if anio not in (anio_actual, anio_anterior):
                continue
            mes = fecha.month
            linea = (str(d.get("Linea") or "")).strip() or SIN_LINEA
            cant = float(_safe(d.get("CantidadNeta")) or 0)
            monto = float(_safe(d.get("MontoNeto")) or 0)
            tiene_datos = True

            bucket = lineas.get(linea)
            if bucket is None:
                bucket = {"linea": linea, "anioAnterior": _anio_vacio(), "anioActual": _anio_vacio()}
                lineas[linea] = bucket

            destino = bucket["anioActual"] if anio == anio_actual else bucket["anioAnterior"]
            destino["cantidad"] += cant
            destino["monto"] += monto
            destino["meses"][mes - 1]["cantidad"] += cant
            destino["meses"][mes - 1]["monto"] += monto

            tot_destino = tot_actual if anio == anio_actual else tot_anterior
            tot_destino["cantidad"] += cant
            tot_destino["monto"] += monto
            tot_destino["meses"][mes - 1]["cantidad"] += cant
            tot_destino["meses"][mes - 1]["monto"] += monto

        lineas_out = []
        for b in lineas.values():
            b["anioAnterior"] = _round_anio(b["anioAnterior"])
            b["anioActual"] = _round_anio(b["anioActual"])
            lineas_out.append(b)
        # Orden por peso (cantidad total de las 2 años) — línea más vendida
        # primero, igual criterio que /compras/consumo (totalVendido desc).
        lineas_out.sort(
            key=lambda b: b["anioAnterior"]["cantidad"] + b["anioActual"]["cantidad"],
            reverse=True,
        )

        cliente_nombre = None
        try:
            cli = fetch_cliente(cod_cliente)
            if cli:
                cliente_nombre = cli.get("nombre")
        except Exception:
            cliente_nombre = None

        return {
            "cliente": {"codigo": int(cod_cliente), "nombre": cliente_nombre},
            "anioAnterior": anio_anterior,
            "anioActual": anio_actual,
            "tieneDatos": tiene_datos,
            "permitido": True,
            "lineas": lineas_out,
            "totales": {
                "anioAnterior": _round_anio(tot_anterior),
                "anioActual": _round_anio(tot_actual),
            },
        }
    finally:
        conn.close()
