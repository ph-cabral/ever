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

# ── Faltantes por OT (fuente NUEVA de /deposito/faltantes) ────────────────────
# Columna de la cabecera OT (base WMS) que guarda el N° de pedido de venta de
# Magnus = VenFer_PedidoCabecera.NroMovVenta. Es lo único que el código no puede
# confirmar solo: si el nombre real es otro, la consulta de faltantes-OT falla.
# CONFIRMAR contra el server con GET /deposito/faltantes-ot/diag (lista las
# columnas reales de OT) y, si hace falta, cambiar SOLO esta constante.
OT_COL_PEDIDO = "OTNroMovVenta"

# Un pedido/factura "descartado" se reconoce por la DESCRIPCIÓN de su estado en
# MAGNUS_SITD.dbo.Pedido_Estados (Ped_EstadoDescripcion). Se excluye todo pedido
# cuya descripción contenga alguno de estos patrones (case-insensitive, LIKE %x%).
# El diagnóstico lista los estados presentes con su conteo para ajustar esto.
PATRONES_DESCARTADO: tuple[str, ...] = ("DESCART", "ANULAD")

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

# Mismo universo, pero por RANGO de snapshots. Cada día de Ven_PedRenPendientes es
# una foto del backlog completo: la misma línea (ped, reng) se repite en la foto de
# cada día hasta que se entrega. Para NO doble contar al ampliar el rango:
#   · se deduplica por (ped, reng) quedándose con la fila más nueva (rn=1) para la
#     CantPendiente / datos actuales, y
#   · PrimerDia = MIN(FecRegistracion) en el rango = primer día que ese faltante
#     aparece. Así "el faltante de cada día" es lo que recién aparece ese día, y la
#     OC se puede restar por día (FIFO) sin contar dos veces lo que ya venía.
# Params: ? = desde_num, ? = hasta_num (días Magnus, ya capados a < hoy en Python).
SQL_FALTANTES_RANGO = """
WITH base AS (
    SELECT
        p.NroPedOrigen, p.NroRengOrigen, p.CodArticu,
        p.CantPendiente, p.CodCliente, p.PrecioVenta, p.FecRegistracion,
        ROW_NUMBER() OVER (
            PARTITION BY p.NroPedOrigen, p.NroRengOrigen
            ORDER BY p.FecRegistracion DESC
        ) AS rn,
        MIN(p.FecRegistracion) OVER (
            PARTITION BY p.NroPedOrigen, p.NroRengOrigen
        ) AS PrimerDiaNum,
        MAX(p.FecRegistracion) OVER (
            PARTITION BY p.NroPedOrigen, p.NroRengOrigen
        ) AS UltimoDiaNum
    FROM EVERWEAR.dbo.[Ven_PedRenPendientes] p
    WHERE p.FecRegistracion BETWEEN ? AND ?
)
SELECT
    b.NroPedOrigen, b.NroRengOrigen,
    CONVERT(date, DATEADD(day, b.FecRegistracion, '1800-12-28')) AS Fecha,
    CONVERT(date, DATEADD(day, b.PrimerDiaNum,   '1800-12-28')) AS PrimerDia,
    u.SecuenciaRutPicking,
    b.CodArticu,
    ap.Detalle      AS Patron,
    s.DetalleMedida AS Medida,
    s.UnidadMedida  AS Unidad,
    b.CantPendiente,
    b.CodCliente,
    b.PrecioVenta,
    ap.Nivel1       AS Linea,
    t.Descripcion   AS TipoArticulo,
    gp.Nombre       AS Preparador,
    pr.RazonSocial  AS Proveedor,
    uv.Usu_Arma_Nombre AS Vendedor
FROM base b
LEFT JOIN EVERWEAR.dbo.[Ubicacion#]            u  ON u.codArticulo    = b.CodArticu AND u.ubicacion NOT LIKE '%[A-Za-z]%'
LEFT JOIN EVERWEAR.dbo.[StkFer_Articulos]      s  ON s.CodArticulo    = b.CodArticu
LEFT JOIN EVERWEAR.dbo.[StkFer_ArtParamet]     ap ON ap.ArticuloPatron = s.ArticuloPatron
LEFT JOIN EVERWEAR.dbo.[Stk_TiposArticulos]    t  ON t.CodigoTipo     = s.NacionalImportado
LEFT JOIN EVERWEAR.dbo.[Com_Proveedores]       pr ON pr.CodProveed    = s.CodProveedHabitual
LEFT JOIN EVERWEAR.dbo.[VenFer_PedidoRengPreparacion] prep ON prep.NroMovVenta = b.NroPedOrigen AND prep.NroRenglon = b.NroRengOrigen
LEFT JOIN EVERWEAR.dbo.[Gen_Usuarios]          gp ON gp.Numero       = prep.CodPreparador
LEFT JOIN EVERWEAR.dbo.[VenFer_PedidoCabecera] cab ON cab.NroMovVenta = b.NroPedOrigen
LEFT JOIN MAGNUS_SITD.dbo.[Ped_Usu_Arma]       uv ON cab.Vendedor    = uv.Usu_Arma_Codigo
WHERE b.rn = 1
  -- Solo lo que sigue pendiente en la foto más nueva del rango: si un renglón se
  -- entregó a mitad del rango (no llega al último snapshot) NO es demanda viva.
  AND b.UltimoDiaNum = (
      SELECT MAX(FecRegistracion)
      FROM EVERWEAR.dbo.[Ven_PedRenPendientes]
      WHERE FecRegistracion BETWEEN ? AND ?
  )
ORDER BY PrimerDia, u.SecuenciaRutPicking, b.NroPedOrigen, b.NroRengOrigen
"""

# Snapshots disponibles (para el selector de fechas de la vista). Solo < hoy.
SQL_FALTANTES_FECHAS = """
SELECT DISTINCT TOP (180)
       CONVERT(date, DATEADD(day, FecRegistracion, '1800-12-28')) AS Fecha
FROM EVERWEAR.dbo.[Ven_PedRenPendientes]
WHERE FecRegistracion < DATEDIFF(day, '1800-12-28', CAST(GETDATE() AS date))
ORDER BY Fecha DESC
"""


def _rango_dias(desde, hasta):
    """desde/hasta = date | 'YYYY-MM-DD' | None → (desde_num, hasta_num) en días
    Magnus. hasta se capa a < hoy (igual que el default) y el span máx a 180 días."""
    today_num = (date.today() - _BASE_PEDIDO).days

    def _to_date(v, default):
        if v is None:
            return default
        if isinstance(v, date):
            return v
        return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()

    h_date = _to_date(hasta, date.today())
    h_num = min((h_date - _BASE_PEDIDO).days, today_num - 1)
    d_date = _to_date(desde, h_date)
    d_num = (d_date - _BASE_PEDIDO).days
    if d_num > h_num:
        d_num = h_num
    if d_num < h_num - 180:
        d_num = h_num - 180
    return d_num, h_num


def _txt(v):
    return str(v).strip() if v is not None else ""


def _int(v):
    v = _safe(v)
    return int(v) if v is not None else None


def _iso(v):
    """date/datetime/str → 'YYYY-MM-DD' o None."""
    if v is None:
        return None
    if isinstance(v, (date, datetime)):
        return v.isoformat()[:10]
    return str(v)[:10]


def fetch_faltantes(desde=None, hasta=None):
    """Sin rango (desde/hasta None): último snapshot con registro < hoy
    (comportamiento original, sin cambios para /deposito/faltantes).

    Con rango: todos los snapshots de [desde, hasta] deduplicados por renglón.
    Cada fila trae además 'Fecha' (snapshot más nuevo del renglón en el rango) y
    'PrimerDia' (primera aparición del faltante en el rango)."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        if desde is None and hasta is None:
            cur.execute(SQL_FALTANTES)
        else:
            d_num, h_num = _rango_dias(desde, hasta)
            # params: BETWEEN del CTE (d,h) + BETWEEN de la subconsulta del último snapshot (d,h)
            cur.execute(SQL_FALTANTES_RANGO, (d_num, h_num, d_num, h_num))
        cols = [c[0] for c in cur.description]
        fecha, rows = None, []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            fila_fecha = _iso(d.get("Fecha"))
            if fecha is None and fila_fecha is not None:
                fecha = fila_fecha
            primer = _iso(d.get("PrimerDia")) or fila_fecha
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
                "Fecha":         fila_fecha,
                "PrimerDia":     primer,
            })
        return {"fecha": fecha, "total": len(rows), "rows": rows}
    finally:
        conn.close()


def fetch_faltantes_fechas():
    """Lista de snapshots disponibles (fechas con registro < hoy), nuevo→viejo."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_FALTANTES_FECHAS)
        out = []
        for row in cur.fetchall():
            f = _iso(row[0])
            if f:
                out.append(f)
        return {"total": len(out), "fechas": out}
    finally:
        conn.close()


# ── Faltantes por OT (NUEVA fuente de /deposito/faltantes) ────────────────────
# En vez de leer el snapshot Ven_PedRenPendientes, se mira el armado real: por cada
# OT de Picking ejecutada se cuentan los renglones (OTItem tipo 1) que se
# RECOLECTARON (CantCumplida > 0 = "cumplido") y los que NO (CantCumplida = 0 =
# "faltante", el operario no encontró el artículo). Se agrupa por OT y se queda
# solo con las OT que tienen al menos un faltante.
#
# OJO "cumplido" es binario (se recolectó algo / nada), igual que la productividad
# (parseDeposito.ts). Un renglón parcial (pidió 10, recolectó 4) cuenta como
# cumplido; para tratar parciales como faltante haría falta la columna de cantidad
# PEDIDA del OTItem (confirmar nombre con el diagnóstico) y comparar contra
# CantCumplida.
#
# La exclusión de "facturas descartadas" se hace por el ESTADO del pedido en
# Magnus: se trae OT.{OT_COL_PEDIDO} = NroMovVenta, se cruza con
# VenFer_PedidoCabecera/Pedido_Estados (conexión EVERWEAR, como el resto) y se
# descarta todo pedido cuyo estado matchee PATRONES_DESCARTADO.
SQL_FALTANTES_OT = """
WITH it AS (
    SELECT OTId,
        SUM(CASE WHEN OTItemTipo = 1 THEN 1 ELSE 0 END)                              AS ItemsTotal,
        SUM(CASE WHEN OTItemTipo = 1 AND OTItemCantCumplida > 0 THEN 1 ELSE 0 END)   AS ItemsCumplidos,
        SUM(CASE WHEN OTItemTipo = 1 AND ISNULL(OTItemCantCumplida, 0) = 0 THEN 1 ELSE 0 END) AS ItemsFaltantes
    FROM OTItem
    GROUP BY OTId
)
SELECT
    OT.OTId,
    CONVERT(varchar(10), OT.OTFechaHoraEjecucion, 23) AS Fecha,
    OT.{col_pedido}            AS NroMovVenta,
    P_Repositor.PersonalNombre AS Operario,
    it.ItemsTotal,
    it.ItemsCumplidos,
    it.ItemsFaltantes
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
INNER JOIN it    ON it.OTId        = OT.OTId
LEFT JOIN Personal P_Repositor ON OT.OTUsuarioGUID_Repositor = P_Repositor.PersonalId
WHERE Codot.CodotProcesoNegocio = 4            -- Picking
  AND OT.OTEstado IN (2, 3, 4)                 -- ejecutada / terminada
  AND OT.OTFechaHoraEjecucion >= ?
  AND OT.OTFechaHoraEjecucion <= ?
  AND it.ItemsFaltantes > 0                    -- solo OT con faltante
ORDER BY it.ItemsFaltantes DESC, OT.OTId DESC
"""

# Último día con Picking ejecutado (< mañana). Default de la vista cuando no se
# pasa rango: muestra el armado del día más reciente.
SQL_OT_ULTIMO_DIA = """
SELECT MAX(CONVERT(date, OT.OTFechaHoraEjecucion)) AS f
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
WHERE Codot.CodotProcesoNegocio = 4
  AND OT.OTEstado IN (2, 3, 4)
  AND OT.OTFechaHoraEjecucion < DATEADD(day, 1, CAST(GETDATE() AS date))
"""

# Estado/cliente/vendedor del pedido (Magnus) para enriquecer y excluir descartados.
SQL_PEDIDOS_INFO = """
SELECT cab.NroMovVenta, cab.CodCliente,
       est.Ped_EstadoDescripcion AS Estado,
       uv.Usu_Arma_Nombre        AS Vendedor
FROM EVERWEAR.dbo.VenFer_PedidoCabecera cab
LEFT JOIN MAGNUS_SITD.dbo.Pedido_Estados est ON cab.EstadoPedido = est.Ped_Estado
LEFT JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma   uv  ON cab.Vendedor     = uv.Usu_Arma_Codigo
WHERE cab.NroMovVenta IN ({ph})
"""


def _rango_ot(desde, hasta):
    """desde/hasta = 'YYYY-MM-DD' | None → (datetime inicio, datetime fin).
    Si falta uno, se usa el otro (rango de un día). Default ambos = None lo maneja
    fetch_faltantes_ot con el último día con armado."""
    hoy = date.today()
    h_d = datetime.strptime(hasta, "%Y-%m-%d").date() if hasta else (
          datetime.strptime(desde, "%Y-%m-%d").date() if desde else hoy)
    d_d = datetime.strptime(desde, "%Y-%m-%d").date() if desde else h_d
    if d_d > h_d:
        d_d = h_d
    d = datetime(d_d.year, d_d.month, d_d.day, 0, 0, 0)
    h = datetime(h_d.year, h_d.month, h_d.day, 23, 59, 59)
    return d, h


def _es_descartado(estado_desc) -> bool:
    s = str(estado_desc or "").upper()
    return any(p in s for p in PATRONES_DESCARTADO)


def _info_pedidos(pedidos):
    """Mapa NroMovVenta -> Cliente / Estado / Vendedor para la lista dada (chunked)."""
    out: dict[int, dict] = {}
    if not pedidos:
        return out
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        CH = 1000
        for i in range(0, len(pedidos), CH):
            chunk = pedidos[i:i + CH]
            ph = ",".join("?" for _ in chunk)
            cur.execute(SQL_PEDIDOS_INFO.format(ph=ph), chunk)
            for r in cur.fetchall():
                out[int(r[0])] = {
                    "Cliente": _safe(r[1]),
                    "Estado":  _txt(r[2]),
                    "Vendedor": _txt(r[3]),
                }
        return out
    finally:
        conn.close()


def fetch_faltantes_ot(desde=None, hasta=None):
    """Faltantes agrupados por OT de Picking. Cumplido = renglón recolectado,
    faltante = renglón sin recolectar. Excluye pedidos descartados (estado Magnus).

    Sin params → último día con armado. Con desde/hasta (YYYY-MM-DD) → ese rango
    por OTFechaHoraEjecucion."""
    conn = get_connection("WMS")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        if desde is None and hasta is None:
            cur.execute(SQL_OT_ULTIMO_DIA)
            row = cur.fetchone()
            dia = row[0] if row else None
            if dia is None:
                return {"fecha": None, "desde": None, "hasta": None,
                        "total": 0, "rows": [],
                        "resumen": {"ot": 0, "itemsTotal": 0, "itemsCumplidos": 0,
                                    "itemsFaltantes": 0, "otDescartadas": 0}}
            d = datetime(dia.year, dia.month, dia.day, 0, 0, 0)
            h = datetime(dia.year, dia.month, dia.day, 23, 59, 59)
        else:
            d, h = _rango_ot(desde, hasta)
        cur.execute(SQL_FALTANTES_OT.format(col_pedido=OT_COL_PEDIDO), (d, h))
        cols = [c[0] for c in cur.description]
        ots = [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        conn.close()

    pedidos = sorted({int(o["NroMovVenta"]) for o in ots if o.get("NroMovVenta") is not None})
    info = _info_pedidos(pedidos)

    rows, excluidas = [], 0
    for o in ots:
        nro = int(o["NroMovVenta"]) if o.get("NroMovVenta") is not None else None
        meta = info.get(nro, {})
        estado = meta.get("Estado")
        if _es_descartado(estado):
            excluidas += 1
            continue
        rows.append({
            "OTId":           _int(o.get("OTId")),
            "NroMovVenta":    nro,
            "Fecha":          _iso(o.get("Fecha")),
            "Operario":       _txt(o.get("Operario")),
            "Cliente":        meta.get("Cliente"),
            "Vendedor":       _txt(meta.get("Vendedor")),
            "EstadoPedido":   _txt(estado),
            "ItemsTotal":     _int(o.get("ItemsTotal")) or 0,
            "ItemsCumplidos": _int(o.get("ItemsCumplidos")) or 0,
            "ItemsFaltantes": _int(o.get("ItemsFaltantes")) or 0,
        })

    resumen = {
        "ot":             len(rows),
        "itemsTotal":     sum(r["ItemsTotal"] for r in rows),
        "itemsCumplidos": sum(r["ItemsCumplidos"] for r in rows),
        "itemsFaltantes": sum(r["ItemsFaltantes"] for r in rows),
        "otDescartadas":  excluidas,
    }
    return {
        "fecha": _iso(d),
        "desde": _iso(d),
        "hasta": _iso(h),
        "total": len(rows),
        "rows":  rows,
        "resumen": resumen,
    }


# Diagnóstico: confirmar el nombre real de la columna pedido en OT y qué estados
# de Magnus aparecen (para ajustar OT_COL_PEDIDO y PATRONES_DESCARTADO).
SQL_COLS_TABLA = """
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = ?
ORDER BY ORDINAL_POSITION
"""


def fetch_faltantes_ot_diag():
    """Lista columnas de OT y OTItem (WMS) y, si se puede, los estados de pedido
    presentes en el último día de armado (EVERWEAR). Para confirmar el mapeo."""
    out: dict = {"ot_col_pedido_actual": OT_COL_PEDIDO,
                 "patrones_descartado": list(PATRONES_DESCARTADO)}
    conn = get_connection("WMS")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_COLS_TABLA, ("OT",))
        ot_cols = [{"col": r[0], "tipo": r[1]} for r in cur.fetchall()]
        cur.execute(SQL_COLS_TABLA, ("OTItem",))
        oti_cols = [{"col": r[0], "tipo": r[1]} for r in cur.fetchall()]
        out["OT_columnas"] = ot_cols
        out["OTItem_columnas"] = oti_cols
        # candidatos a "columna del pedido" en OT
        out["OT_candidatos_pedido"] = [
            c["col"] for c in ot_cols
            if any(k in c["col"].upper() for k in ("MOVVENTA", "PEDIDO", "COMPROB", "NROMOV"))
        ]
        # candidatos a "cantidad PEDIDA" en OTItem (columnas de cantidad que NO son la
        # cumplida): una de estas es la que hay que comparar contra OTItemCantCumplida
        # para medir el faltante por unidades (pedida − cumplida).
        out["OTItem_candidatos_cantidad"] = [
            c["col"] for c in oti_cols
            if "CANT" in c["col"].upper() and "CUMPL" not in c["col"].upper()
        ]
        # muestra de renglones de Picking (tipo 1): mirando los valores se ve cuál
        # columna trae lo PEDIDO (debería ser >= OTItemCantCumplida).
        cur.execute("SELECT TOP 5 * FROM OTItem WHERE OTItemTipo = 1 ORDER BY OTId DESC")
        scols = [c[0] for c in cur.description]
        out["OTItem_muestra"] = [
            {c: _safe(v) for c, v in zip(scols, row)} for row in cur.fetchall()
        ]
    finally:
        conn.close()
    return out


# ── Tablero EN VIVO del depósito (/deposito/vivo) ─────────────────────────────
# Cuántos pedidos (OT) hay EN ESPERA, cuántos EN PROCESO y la carga por operario
# AHORA mismo. Se lee en vivo del WMS (READ UNCOMMITTED, igual que la productividad),
# nunca se escribe. No se filtra por fecha: una OT "viva" es la que todavía no está
# terminada, sin importar cuándo entró.
#
# Lógica del estado (OT.OTEstado). La productividad usa IN (2,3,4) = trabajo ya
# ejecutado/terminado; por descarte 0/1 son "todavía no ejecutadas":
#   · EN ESPERA  -> OTEstado en ESTADOS_EN_ESPERA  (generada/pendiente, sin arrancar)
#   · EN PROCESO -> OTEstado en ESTADOS_EN_PROCESO (arrancada, sin cerrar)
#   · (3, 4 = terminada/cerrada -> NO se cuentan acá)
#
# IMPORTANTE: estos códigos son la mejor inferencia (mismo criterio que la
# productividad). Si no cuadran con la realidad, MIRÁ el bloque "diagnostico" que
# devuelve este endpoint (cuenta las OT por OTEstado en la ventana viva) y ajustá
# las dos tuplas de abajo. Es el único lugar a tocar.
PROCESOS_VIVO: tuple[int, ...] = (4,)          # 4 = Picking ("pedidos"). Ampliar si hace falta.
ESTADOS_EN_ESPERA: tuple[int, ...] = (0, 1)    # generada / pendiente, sin ejecutar
ESTADOS_EN_PROCESO: tuple[int, ...] = (2,)     # en ejecución, sin cerrar

# Carga viva por estado + operario (solo OT no terminadas).
SQL_VIVO = """
SELECT
    OT.OTEstado              AS Estado,
    P.PersonalNombre         AS Operario,
    COUNT(*)                 AS Cantidad
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
LEFT JOIN Personal P ON OT.OTUsuarioGUID_Repositor = P.PersonalId
WHERE Codot.CodotProcesoNegocio IN ({procesos})
  AND OT.OTEstado IN ({estados})
GROUP BY OT.OTEstado, P.PersonalNombre
"""

# Diagnóstico: TODAS las OT de Picking sin ejecutar o ejecutadas en los últimos
# 2 días, contadas por OTEstado. Sirve para confirmar qué código es cada cosa
# (las "en espera" suelen tener SinEjecucion = total). Acotado para que sea barato.
SQL_VIVO_DIAG = """
SELECT
    OT.OTEstado AS Estado,
    SUM(CASE WHEN OT.OTFechaHoraEjecucion IS NULL THEN 1 ELSE 0 END) AS SinEjecucion,
    COUNT(*) AS Cantidad
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
WHERE Codot.CodotProcesoNegocio IN ({procesos})
  AND (OT.OTFechaHoraEjecucion IS NULL
       OR OT.OTFechaHoraEjecucion >= DATEADD(day, -2, CAST(GETDATE() AS date)))
GROUP BY OT.OTEstado
ORDER BY OT.OTEstado
"""


def fetch_vivo(procesos: tuple[int, ...] = PROCESOS_VIVO):
    """Estado del depósito EN VIVO: pedidos (OT) en espera / en proceso y por operario."""
    proc_in = ",".join(str(int(p)) for p in procesos)
    est_in = ",".join(str(int(e)) for e in (ESTADOS_EN_ESPERA + ESTADOS_EN_PROCESO))

    conn = get_connection("WMS")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")

        cur.execute(SQL_VIVO.format(procesos=proc_in, estados=est_in))
        en_espera = 0
        en_proceso = 0
        por_op: dict[str, dict] = {}
        sin_asignar = {"en_espera": 0, "en_proceso": 0}
        for estado, operario, cant in cur.fetchall():
            cant = int(cant or 0)
            bucket = "en_espera" if int(estado) in ESTADOS_EN_ESPERA else "en_proceso"
            if bucket == "en_espera":
                en_espera += cant
            else:
                en_proceso += cant
            nombre = (str(operario).strip() if operario is not None else "")
            if not nombre:
                sin_asignar[bucket] += cant
            else:
                o = por_op.setdefault(nombre, {"en_espera": 0, "en_proceso": 0})
                o[bucket] += cant

        operarios = [
            {
                "operario": k,
                "en_espera": v["en_espera"],
                "en_proceso": v["en_proceso"],
                "total": v["en_espera"] + v["en_proceso"],
            }
            for k, v in por_op.items()
        ]
        operarios.sort(key=lambda x: (-x["en_proceso"], -x["total"], x["operario"]))

        cur.execute(SQL_VIVO_DIAG.format(procesos=proc_in))
        diag = [
            {"estado": int(e), "sin_ejecucion": int(se or 0), "cantidad": int(c or 0)}
            for e, se, c in cur.fetchall()
        ]

        return {
            "generado_en": datetime.now().astimezone().isoformat(timespec="seconds"),
            "en_espera": en_espera,
            "en_proceso": en_proceso,
            "operarios_activos": sum(1 for o in operarios if o["en_proceso"] > 0),
            "sin_asignar": sin_asignar,
            "por_operario": operarios,
            "config": {
                "procesos": list(procesos),
                "estados_en_espera": list(ESTADOS_EN_ESPERA),
                "estados_en_proceso": list(ESTADOS_EN_PROCESO),
            },
            "diagnostico": {"por_estado": diag},
        }
    finally:
        conn.close()
