"""
Consultas en vivo para la pagina /deposito de ever (reemplazan los Excel).

- WMS  -> Productividad de Operarios (lean: solo columnas que usa el parser TS).
          Base WMS, datetime nativo, filtra por OTFechaHoraEjecucion.
- TIEMPO -> EVERWEAR.dbo.TMP_TiempoDePedidos (la misma tabla que exportaba el xlsx).

OJO compatibilidad con lib/deposito/parseDeposito.ts:
  * PROCESO se devuelve SIN acentos ('Reposicion','Re-Ubicacion','Libre','Picking')
    porque cleanProc() matchea 'Libre'/'Reposicion' exactos.
  * FECHA EJECUCION en dd/mm/yyyy (CONVERT 103) para que parseFecha() use el
    regex local y no haya corrimiento por timezone (ART = UTC-3).
"""
from datetime import datetime, date, timedelta
from decimal import Decimal
from db import get_connection

# ── Productividad WMS (lean) ──────────────────────────────────────────────────
SQL_WMS = """
SELECT
    CONVERT(varchar(10), OT.OTFechaHoraEjecucion, 103) AS [FECHA EJECUCION],
    CASE Codot.CodotProcesoNegocio
        WHEN 1 THEN 'Reposicion'
        WHEN 2 THEN 'Interdeposito'
        WHEN 3 THEN 'Re-Ubicacion'
        WHEN 4 THEN 'Picking'
        WHEN 5 THEN 'Libre'
    END                              AS [PROCESO],
    P_Repositor.PersonalNombre       AS [OPERARIO],
    ISNULL(i.[CANT. ITEM DE RECOLECCION], 0) AS [CANT. ITEM DE RECOLECCION],
    ISNULL(i.[CANT. ITEM RECOLECTADOS], 0)   AS [CANT. ITEM RECOLECTADOS]
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
LEFT JOIN Personal P_Repositor ON OT.OTUsuarioGUID_Repositor = P_Repositor.PersonalId
LEFT JOIN (
    SELECT OTId,
        SUM(CASE WHEN OTItemTipo = 1 THEN 1 ELSE 0 END)                          AS [CANT. ITEM DE RECOLECCION],
        SUM(CASE WHEN OTItemTipo = 1 AND OTItemCantCumplida > 0 THEN 1 ELSE 0 END) AS [CANT. ITEM RECOLECTADOS]
    FROM OTItem GROUP BY OTId
) i ON OT.OTId = i.OTId
WHERE OT.OTEstado IN (2, 3, 4)
  AND OT.OTFechaHoraEjecucion >= ?
  AND OT.OTFechaHoraEjecucion <= ?
ORDER BY OT.OTId DESC
"""

SQL_TIEMPO = "SELECT * FROM dbo.TMP_TiempoDePedidos ORDER BY NroMovVenta DESC"


def _safe(value, colname=""):
    """Convierte tipos SQL a JSON-safe."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        # La fecha del reporte de tiempos la queremos dd/mm/yyyy (lo que espera el parser)
        if "fecha" in colname.lower():
            return value.strftime("%d/%m/%Y")
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", "ignore")
    return value


def _rows(cur):
    cols = [c[0] for c in cur.description]
    return [{c: _safe(v, c) for c, v in zip(cols, row)} for row in cur.fetchall()]


def fetch_wms(desde: datetime, hasta: datetime):
    conn = get_connection("WMS")
    try:
        cur = conn.cursor()
        # es-AR puede venir dmy; READ UNCOMMITTED para no lockear el WMS productivo
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_WMS, (desde, hasta))
        return _rows(cur)
    finally:
        conn.close()


def fetch_tiempo():
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd;")
        cur.execute(SQL_TIEMPO)
        return _rows(cur)
    finally:
        conn.close()


# ── Pedidos ingresados (registrados) por día ──────────────────────────────────
# EVERWEAR.dbo.VenFer_PedidoCabecera.FechaPedido = entero de días desde 1800-12-28
# (base Magnus). Mismo filtro de comprobantes que /indicadores.
_BASE_PEDIDO = date(1800, 12, 28)

# Solo estados de facturación válidos: Abierto, Confirmado, Cerrado, Facturado.
# Se descartan Cancelado, No Autorizado y Sin Confirmar. LIKE 'x%' tolera
# singular/plural y espacios de relleno; collation CI ignora mayúsculas.
SQL_INGRESADOS = """
SELECT p.FechaPedido AS f, COUNT(DISTINCT p.NroMovVenta) AS pedidos
FROM EVERWEAR.dbo.VenFer_PedidoCabecera p
LEFT JOIN MAGNUS_SITD.dbo.Pedido_Estados e ON p.EstadoPedido = e.Ped_Estado
WHERE p.CompCodigo NOT IN (9, 49, 208, 410)
  AND (
        LTRIM(e.Ped_EstadoDescripcion) LIKE 'Abierto%'
     OR LTRIM(e.Ped_EstadoDescripcion) LIKE 'Confirmado%'
     OR LTRIM(e.Ped_EstadoDescripcion) LIKE 'Cerrado%'
     OR LTRIM(e.Ped_EstadoDescripcion) LIKE 'Facturado%'
  )
  AND p.FechaPedido BETWEEN ? AND ?
GROUP BY p.FechaPedido
"""


def fetch_ingresados(desde, hasta):
    """desde/hasta = datetime|date. Devuelve [{fecha 'YYYY-MM-DD', pedidos}]."""
    dd = desde.date() if hasattr(desde, "date") else desde
    dh = hasta.date() if hasattr(hasta, "date") else hasta
    d0 = (dd - _BASE_PEDIDO).days
    d1 = (dh - _BASE_PEDIDO).days
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd;")
        cur.execute(SQL_INGRESADOS, (d0, d1))
        out = []
        for f, pedidos in cur.fetchall():
            if f is None:
                continue
            fecha = (_BASE_PEDIDO + timedelta(days=int(f))).isoformat()
            out.append({"fecha": fecha, "pedidos": int(pedidos)})
        return out
    finally:
        conn.close()
