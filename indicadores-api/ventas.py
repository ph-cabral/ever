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
        cols = [c[0] for c in cur.description]
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
# Top clientes (cantidad/monto en un rango de meses) — /ventas/vendedor,
# debajo de la tabla principal (pedido de Pablo 2026-08-14): "top 10 de los
# clientes que más compraron", tomando SOLO los clientes que ya pasan el
# mismo filtro de acceso por vendedor que usa el buscador de clientes
# (fetch_clientes_search/SQL_CLIENTES_SEARCH_POR_VENDEDOR) — un no-admin
# nunca ve en este ranking un cliente que no es suyo. Admin (`vendedor=None`)
# ve el ranking de toda la empresa.
#
# PERF (pedido de Pablo 2026-08-14, "el top 10 tarda mucho"): la primera
# versión resolvía esto en DOS pasos — 1) traer TODOS los códigos de
# cliente del maestro Magnus, 2) volver a pegarle a
# Ven_CompCabecera/Renglon en chunks de 1000 códigos (`CodCliente IN
# (...)`) — o sea, tantos round-trips como chunks, cada uno re-armando el
# JOIN completo. Ahora es UNA sola consulta: se hace el JOIN
# Clientes→Vendedor_Zona→Ped_Usu_Arma→Ven_CompCabecera→Ven_CompRenglon→
# Ven_CodCom de una, dejando que el motor arme un solo plan (en vez de
# N ejecuciones separadas) — el filtro de vendedor (cuando aplica) entra
# en el WHERE de esta misma consulta, no en un round-trip aparte. La suma
# se sigue haciendo en SQL (GROUP BY por cliente/año/MES ahora, antes solo
# año), no se traen renglones sueltos a Python.
#
# RANGO DE MESES (pedido de Pablo 2026-08-14, mismo día): por defecto trae
# los últimos 6 meses (mes actual + 5 anteriores), y se puede pedir
# cualquier otro rango con `desde`/`hasta` ("YYYY-MM"). El filtro de rango
# se aplica en PYTHON después de traer el agregado por (cliente, año, mes)
# — A PROPÓSITO no se agregó `WHERE` filtrando por fecha en SQL: el mismo
# gotcha que ya tiene fetch_ventas_por_linea (comparar
# dbo.fecha_cla2sql(...) contra un parámetro de fecha no filtra bien con
# este driver viejo — se pierden filas SIN error) hace arriesgado meter
# un filtro de fecha en el WHERE sin poder probarlo primero contra Magnus
# real. Como el agregado ya viene resumido a nivel (cliente, año, mes) —
# no a nivel renglón — lo que se descarta en Python después es chico, así
# que el costo de no filtrar en SQL es aceptable. Si en el futuro hace
# falta más velocidad, ahí sí vale la pena probar con cuidado un filtro
# `WHERE YEAR(...)=? AND MONTH(...) IN (...)` contra la base real (no
# contra un `BETWEEN` de fechas, que es justo el patrón que falla).
#
# Además se cachea el resultado en memoria por `_TOP_CLIENTES_TTL_SEG`
# (el front pide esto solo en /ventas/vendedor apenas se monta la
# página o cambia el rango elegido, no hace falta que sea al segundo).
# Cache simple de proceso (uvicorn corre con 1 worker, ver main.py) — si
# el día de mañana hay más workers, cada uno cachea por su lado, lo cual
# sigue siendo correcto, solo menos efectivo.
_TOP_CLIENTES_CACHE: dict[tuple, tuple[float, dict]] = {}
_TOP_CLIENTES_TTL_SEG = 15 * 60  # 15 minutos

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


def _rango_meses(desde: tuple[int, int], hasta: tuple[int, int]) -> set[tuple[int, int]]:
    """Todos los (año, mes) entre desde y hasta, inclusive — se banca que
    vengan invertidos (los reordena)."""
    a, b = (desde, hasta) if desde <= hasta else (hasta, desde)
    out: set[tuple[int, int]] = set()
    anio, mes = a
    while (anio, mes) <= b:
        out.add((anio, mes))
        mes += 1
        if mes > 12:
            mes = 1
            anio += 1
    return out


SQL_TOP_CLIENTES_VENDEDOR = """
SELECT
    c.CodCliente AS CodCliente,
    LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre,
    YEAR(dbo.fecha_cla2sql(vc.FecMovim)) AS Anio,
    MONTH(dbo.fecha_cla2sql(vc.FecMovim)) AS Mes,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE r.Cantidad * -1 END) AS CantidadNeta,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) AS MontoNeto
FROM MAGNUS_SITD.dbo.Clientes c
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz ON vz.Clasif_VendZona = c.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma pu  ON LTRIM(RTRIM(pu.Usu_Arma_Nombre)) = LTRIM(RTRIM(vz.Vendedor))
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
WHERE pu.Usu_Arma_Codigo = ?
  AND cc.EvitaInformesYListados <> 1
GROUP BY c.CodCliente, LTRIM(RTRIM(c.Cliente_Nombre)), YEAR(dbo.fecha_cla2sql(vc.FecMovim)), MONTH(dbo.fecha_cla2sql(vc.FecMovim))
"""

SQL_TOP_CLIENTES_TODOS = """
SELECT
    c.CodCliente AS CodCliente,
    LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre,
    YEAR(dbo.fecha_cla2sql(vc.FecMovim)) AS Anio,
    MONTH(dbo.fecha_cla2sql(vc.FecMovim)) AS Mes,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE r.Cantidad * -1 END) AS CantidadNeta,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) AS MontoNeto
FROM MAGNUS_SITD.dbo.Clientes c
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
WHERE cc.EvitaInformesYListados <> 1
GROUP BY c.CodCliente, LTRIM(RTRIM(c.Cliente_Nombre)), YEAR(dbo.fecha_cla2sql(vc.FecMovim)), MONTH(dbo.fecha_cla2sql(vc.FecMovim))
"""


def fetch_top_clientes(
    vendedor: int | None = None,
    limit: int = 10,
    desde: str | None = None,
    hasta: str | None = None,
    forzar: bool = False,
) -> dict:
    """Top clientes por cantidad y por monto (venta neta) en un rango de
    meses — para el ranking debajo de la tabla de /ventas/vendedor (pedido
    de Pablo 2026-08-14). Devuelve DOS rankings ya armados (`porCantidad`,
    `porMonto`) para que el front elija cuál mostrar según el switch
    Unidades/Pesos, sin tener que reordenar en el cliente.

    `vendedor`: mismo criterio de acceso que fetch_clientes_search — si se
    pasa, el ranking sale SOLO de los clientes cuyo "Vendedor por Defecto"
    fijo es ese código (ver clientes.SQL_VENDEDOR_FIJO_CLIENTE, mismo JOIN
    Clientes→Vendedor_Zona→Ped_Usu_Arma, ahora en la MISMA consulta — ver
    nota de PERF arriba). `None` (admin) no filtra, ranking de toda la
    empresa.

    `desde`/`hasta` ("YYYY-MM"): rango de meses a incluir, AMBOS
    inclusive. Default (pedido de Pablo 2026-08-14): últimos 6 meses —
    `hasta` = mes actual, `desde` = 5 meses antes. No respeta el selector
    de período (YTD/meses) de la tabla principal, es un filtro propio de
    este ranking. Lanza `ValueError` si el formato no es "YYYY-MM".

    `forzar=True` ignora el cache (por si hace falta refrescar a mano sin
    esperar el TTL — no está expuesto todavía en la ruta HTTP, pensado para
    debug)."""
    hoy_ym = (date.today().year, date.today().month)
    hasta_ym = _parse_ym(hasta) if hasta else hoy_ym
    desde_ym = _parse_ym(desde) if desde else _mes_atras(hasta_ym, 5)
    periodo = _rango_meses(desde_ym, hasta_ym)
    # Por si vinieron invertidos: _rango_meses ya los reordena, pero lo que
    # devolvemos como "desde"/"hasta" tiene que reflejar el orden real.
    desde_ym, hasta_ym = min(periodo), max(periodo)

    limit_i = max(1, min(int(limit or 10), 50))
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
            cur.execute(SQL_TOP_CLIENTES_TODOS)
        else:
            cur.execute(SQL_TOP_CLIENTES_VENDEDOR, (int(vendedor),))
        cols = [c[0] for c in cur.description]
        totales: dict[int, dict] = {}
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            anio, mes = d.get("Anio"), d.get("Mes")
            if anio is None or mes is None or (anio, mes) not in periodo:
                continue
            cod = int(d.get("CodCliente"))
            cant = float(_safe(d.get("CantidadNeta")) or 0)
            monto = float(_safe(d.get("MontoNeto")) or 0)
            acc = totales.setdefault(
                cod,
                {"nombre": (str(d.get("Nombre")).strip() if d.get("Nombre") else None), "cantidad": 0.0, "monto": 0.0},
            )
            acc["cantidad"] += cant
            acc["monto"] += monto

        clientes = [
            {
                "numero": cod,
                "nombre": vals["nombre"],
                "cantidad": round(vals["cantidad"], 2),
                "monto": round(vals["monto"], 2),
            }
            for cod, vals in totales.items()
            if vals["cantidad"] > 0 or vals["monto"] > 0
        ]

        top_cantidad = sorted(clientes, key=lambda c: c["cantidad"], reverse=True)[:limit_i]
        top_monto = sorted(clientes, key=lambda c: c["monto"], reverse=True)[:limit_i]

        resultado = {
            "desde": f"{desde_ym[0]:04d}-{desde_ym[1]:02d}",
            "hasta": f"{hasta_ym[0]:04d}-{hasta_ym[1]:02d}",
            "porCantidad": top_cantidad,
            "porMonto": top_monto,
        }
        _TOP_CLIENTES_CACHE[cache_key] = (ahora, resultado)
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
