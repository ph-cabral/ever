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
