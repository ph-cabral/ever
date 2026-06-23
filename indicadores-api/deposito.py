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

SQL_TIEMPO = """
SELECT * FROM dbo.TMP_TiempoDePedidos
WHERE TRY_CAST(LEFT(CodComprobante, CHARINDEX(' ', CodComprobante + ' ') - 1) AS INT) IN (10, 100, 210, 310)
  AND LTRIM(RTRIM(Estado)) IN ('Facturado', 'Cerrado')
ORDER BY NroMovVenta DESC
"""


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
_BASE_PEDIDO = date(1800, 12, 28)


SQL_INGRESADOS = """
SELECT TRY_CONVERT(date, LTRIM(RTRIM(t.FechaRegistracionPedido)), 103) AS f,
       COUNT(*) AS pedidos
FROM dbo.TMP_TiempoDePedidos t
WHERE TRY_CONVERT(date, LTRIM(RTRIM(t.FechaRegistracionPedido)), 103) BETWEEN ? AND ?
  AND TRY_CAST(LEFT(t.CodComprobante, CHARINDEX(' ', t.CodComprobante + ' ') - 1) AS INT) IN (10, 70, 100, 210, 310)
  AND LTRIM(RTRIM(t.Estado)) IN ('Abierto', 'Cerrado', 'Facturado')
  AND LTRIM(RTRIM(ISNULL(t.CodComprobante_Factura, 'SinCodigo'))) <> 'SinCodigo'
GROUP BY TRY_CONVERT(date, LTRIM(RTRIM(t.FechaRegistracionPedido)), 103)
ORDER BY f
"""


def fetch_ingresados(desde, hasta):
    """desde/hasta = datetime. Pedidos mayoristas/día desde TMP_TiempoDePedidos."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd;")
        cur.execute(SQL_INGRESADOS, (desde, hasta))
        out = []
        for f, pedidos in cur.fetchall():
            if f is None:
                continue
            fecha = f.isoformat() if hasattr(f, "isoformat") else str(f)
            out.append({"fecha": fecha, "pedidos": int(pedidos)})
        return out
    finally:
        conn.close()


# ── Faltantes (renglones pendientes del último día con registro < hoy) ────────
SQL_FALTANTES = """
SELECT
    p.NroPedOrigen, p.NroRengOrigen,
    CONVERT(date, DATEADD(day, p.FecRegistracion, '1800-12-28')) AS Fecha,
    u.SecuenciaRutPicking,
    p.CodArticu,
    ap.Detalle      AS Patron,
    s.DetalleMedida AS Medida,
    s.UnidadMedida  AS Unidad,
    p.CantPendiente,
    p.CodCliente,
    p.PrecioVenta,
    ap.Nivel1       AS Linea,
    t.Descripcion   AS TipoArticulo,
    gp.Nombre       AS Preparador,
    pr.RazonSocial  AS Proveedor,
    uv.Usu_Arma_Nombre AS Vendedor
FROM EVERWEAR.dbo.[Ven_PedRenPendientes] p
LEFT JOIN EVERWEAR.dbo.[Ubicacion#]            u  ON u.codArticulo    = p.CodArticu AND u.ubicacion NOT LIKE '%[A-Za-z]%'
LEFT JOIN EVERWEAR.dbo.[StkFer_Articulos]      s  ON s.CodArticulo    = p.CodArticu
LEFT JOIN EVERWEAR.dbo.[StkFer_ArtParamet]     ap ON ap.ArticuloPatron = s.ArticuloPatron
LEFT JOIN EVERWEAR.dbo.[Stk_TiposArticulos]    t  ON t.CodigoTipo     = s.NacionalImportado
LEFT JOIN EVERWEAR.dbo.[Com_Proveedores]       pr ON pr.CodProveed    = s.CodProveedHabitual
LEFT JOIN EVERWEAR.dbo.[VenFer_PedidoRengPreparacion] prep ON prep.NroMovVenta = p.NroPedOrigen AND prep.NroRenglon = p.NroRengOrigen
LEFT JOIN EVERWEAR.dbo.[Gen_Usuarios]          gp ON gp.Numero       = prep.CodPreparador
LEFT JOIN EVERWEAR.dbo.[VenFer_PedidoCabecera] cab ON cab.NroMovVenta = p.NroPedOrigen
LEFT JOIN MAGNUS_SITD.dbo.[Ped_Usu_Arma]       uv ON cab.Vendedor    = uv.Usu_Arma_Codigo
WHERE p.FecRegistracion = (
    SELECT MAX(FecRegistracion)
    FROM EVERWEAR.dbo.[Ven_PedRenPendientes]
    WHERE FecRegistracion < DATEDIFF(day, '1800-12-28', CAST(GETDATE() AS date))
)
ORDER BY u.SecuenciaRutPicking, p.NroPedOrigen, p.NroRengOrigen
"""


def _txt(v):
    return str(v).strip() if v is not None else ""


def _int(v):
    v = _safe(v)
    return int(v) if v is not None else None


def fetch_faltantes():
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_FALTANTES)
        cols = [c[0] for c in cur.description]
        fecha, rows = None, []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            if fecha is None and d.get("Fecha") is not None:
                f = d["Fecha"]
                fecha = f.isoformat() if isinstance(f, (date, datetime)) else str(f)[:10]
            nombre = " ".join(" ".join(_txt(d.get(c)) for c in ("Patron", "Medida", "Unidad")).split())
            cant   = float(_safe(d.get("CantPendiente")) or 0)
            precio = float(_safe(d.get("PrecioVenta")) or 0)
            rows.append({
                "NroPedOrigen":  _int(d.get("NroPedOrigen")),
                "NroRengOrigen": _int(d.get("NroRengOrigen")),
                "Ubicacion":     _safe(d.get("SecuenciaRutPicking")),
                "CodArticulo":   _txt(d.get("CodArticu")),
                "Nombre":        nombre,
                "CantPend":      cant,
                "Cliente":       _safe(d.get("CodCliente")),
                "Importe":       round(precio * cant, 2),
                "TipoArticulo":  _txt(d.get("TipoArticulo")).replace("Fabril", "Fabrica"),
                "Preparador":    _txt(d.get("Preparador")),
                "Linea":         _safe(d.get("Linea")),
                "Proveedor":     _txt(d.get("Proveedor")),
                "Vendedor":      _txt(d.get("Vendedor")),
            })
        return {"fecha": fecha, "total": len(rows), "rows": rows}
    finally:
        conn.close()
