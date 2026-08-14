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
# Top clientes (cantidad/monto del año en curso) — /ventas/vendedor, debajo
# de la tabla principal (pedido de Pablo 2026-08-14): "top 10 de los
# clientes que más compraron", tomando SOLO los clientes que ya pasan el
# mismo filtro de acceso por vendedor que usa el buscador de clientes
# (fetch_clientes_search/SQL_CLIENTES_SEARCH_POR_VENDEDOR) — un no-admin
# nunca ve en este ranking un cliente que no es suyo. Admin (`vendedor=None`)
# ve el ranking de toda la empresa.
#
# A diferencia de fetch_ventas_por_linea (un solo cliente, se puede filtrar
# por CodCliente = ? que es "columna simple" y filtra bien), acá hay muchos
# clientes: se resuelve primero la LISTA de códigos permitidos (consulta
# chica, contra el maestro Magnus.Clientes) y se filtra Ven_CompCabecera con
# `CodCliente IN (...)` en chunks de 1000 (mismo patrón que
# fetch_pedidos_mes) — sigue siendo "columna simple", filtra bien. La suma
# por cliente/año se hace en SQL (GROUP BY), no se traen renglones sueltos a
# Python, para que el caso admin (toda la empresa) no sea pesado. El año se
# filtra en Python después de traer el agregado (mismo gotcha que en
# fetch_ventas_por_linea: comparar fecha_cla2sql() contra un parámetro en el
# WHERE no filtra bien con este driver — pero como acá ya viene agregado por
# año, el volumen que se descarta en Python es chico).
SQL_TOP_CLIENTES_CODIGOS_VENDEDOR = """
SELECT c.CodCliente AS numero, LTRIM(RTRIM(c.Cliente_Nombre)) AS nombre
FROM MAGNUS_SITD.dbo.Clientes c
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz ON vz.Clasif_VendZona = c.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma pu  ON LTRIM(RTRIM(pu.Usu_Arma_Nombre)) = LTRIM(RTRIM(vz.Vendedor))
WHERE pu.Usu_Arma_Codigo = ?
"""

SQL_TOP_CLIENTES_CODIGOS_TODOS = """
SELECT c.CodCliente AS numero, LTRIM(RTRIM(c.Cliente_Nombre)) AS nombre
FROM MAGNUS_SITD.dbo.Clientes c
"""

SQL_VENTAS_POR_CLIENTE_ANIO = """
SELECT
    c.CodCliente AS CodCliente,
    YEAR(dbo.fecha_cla2sql(c.FecMovim)) AS Anio,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE r.Cantidad * -1 END) AS CantidadNeta,
    SUM(CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) ELSE (r.Cantidad * r.PrecioVenta) * -1 END) AS MontoNeto
FROM Ven_CompCabecera c
JOIN Ven_CompRenglon r ON r.NroMovVenta = c.NroMovVenta
JOIN Ven_CodCom cc      ON c.CompCodigo = cc.CompCodigo
WHERE cc.EvitaInformesYListados <> 1
  AND c.CodCliente IN ({ph})
GROUP BY c.CodCliente, YEAR(dbo.fecha_cla2sql(c.FecMovim))
"""


def fetch_top_clientes(vendedor: int | None = None, limit: int = 10) -> dict:
    """Top clientes por cantidad y por monto (venta neta) del año en curso —
    para el ranking debajo de la tabla de /ventas/vendedor (pedido de Pablo
    2026-08-14). Devuelve DOS rankings ya armados (`porCantidad`,
    `porMonto`) para que el front elija cuál mostrar según el switch
    Unidades/Pesos, sin tener que reordenar en el cliente.

    `vendedor`: mismo criterio de acceso que fetch_clientes_search — si se
    pasa, el ranking sale SOLO de los clientes cuyo "Vendedor por Defecto"
    fijo es ese código (ver clientes.SQL_VENDEDOR_FIJO_CLIENTE). `None`
    (admin) no filtra, ranking de toda la empresa.

    Solo año en curso (no hay comparación con el año anterior acá, a
    diferencia de fetch_ventas_por_linea) y no respeta el selector de
    período (YTD/meses) de la tabla principal — es un ranking anual simple."""
    anio_actual = date.today().year

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        if vendedor is None:
            cur.execute(SQL_TOP_CLIENTES_CODIGOS_TODOS)
        else:
            cur.execute(SQL_TOP_CLIENTES_CODIGOS_VENDEDOR, (int(vendedor),))
        cols = [c[0] for c in cur.description]
        nombres: dict[int, str | None] = {}
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            num = d.get("numero")
            if num is None:
                continue
            nombre = d.get("nombre")
            nombres[int(num)] = str(nombre).strip() if nombre else None

        codigos = sorted(nombres.keys())
        totales: dict[int, dict] = {}
        CH = 1000
        for i in range(0, len(codigos), CH):
            chunk = codigos[i:i + CH]
            ph = ",".join("?" for _ in chunk)
            cur.execute(SQL_VENTAS_POR_CLIENTE_ANIO.format(ph=ph), chunk)
            rcols = [c[0] for c in cur.description]
            for row in cur.fetchall():
                d = dict(zip(rcols, row))
                if d.get("Anio") != anio_actual:
                    continue
                cod = int(d.get("CodCliente"))
                cant = float(_safe(d.get("CantidadNeta")) or 0)
                monto = float(_safe(d.get("MontoNeto")) or 0)
                acc = totales.setdefault(cod, {"cantidad": 0.0, "monto": 0.0})
                acc["cantidad"] += cant
                acc["monto"] += monto

        clientes = [
            {
                "numero": cod,
                "nombre": nombres.get(cod),
                "cantidad": round(vals["cantidad"], 2),
                "monto": round(vals["monto"], 2),
            }
            for cod, vals in totales.items()
            if vals["cantidad"] > 0 or vals["monto"] > 0
        ]

        limit_i = max(1, min(int(limit or 10), 50))
        top_cantidad = sorted(clientes, key=lambda c: c["cantidad"], reverse=True)[:limit_i]
        top_monto = sorted(clientes, key=lambda c: c["monto"], reverse=True)[:limit_i]

        return {
            "anioActual": anio_actual,
            "porCantidad": top_cantidad,
            "porMonto": top_monto,
        }
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
