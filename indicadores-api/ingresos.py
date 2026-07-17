"""
Remitos de ingreso de mercadería x OC (Magnus, SOLO LECTURA).

Reproduce el remito impreso "RMTO. ING. MERCAD. x O.CPA" (mismo modelo
verificado en ingresos_extraccion.py, raíz del repo `vicki`): remitos de
compra ligados a una OC (NroOrdCompra != 0), ya CONCRETADOS (a diferencia de
compras.py que trae lo PENDIENTE de recibir).

Para /ventas/faltantes ("Tabla 2" — listos para vender): confirma que un
renglón con fecha de arribo cargada YA llegó físicamente. Se cruza por
CodArticulo contra preparado.faltante_control (fechaArribo + clienteQuiere),
del lado de `ever` (app/api/ventas/faltantes/route.ts).

Tablas (EVERWEAR, confirmadas por ingresos_extraccion.py):
  · Com_RemitoCabecera  → NroMovRemito, CompCentro, CompNumero,
                           FecComprobante (int base-1800), NroOrdCompra, CodProveed
  · Com_RemitoRenglones → NroMovRemito, NroRenglon, CodArticulo, Cantidad
  · Com_Proveedores     → CodProveed, RazonSocial
"""
from datetime import datetime, date, timedelta
from decimal import Decimal
from db import get_connection

BASE_DATE = date(1800, 12, 28)  # Magnus guarda fechas como días desde esta base

# Ventana por defecto si no viene `desde`: no traer todo el histórico.
INGRESOS_DIAS_DEFAULT = 60


def _safe(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", "ignore")
    return value


def _fecha_comprobante(v):
    """FecComprobante = int (días Magnus) → ISO yyyy-mm-dd o None."""
    if v is None:
        return None
    if isinstance(v, (date, datetime)):
        return v.date().isoformat() if v.year >= 1901 else None
    try:
        dias = int(v)
    except (TypeError, ValueError):
        return None
    if dias <= 0:
        return None
    return (BASE_DATE + timedelta(days=dias)).isoformat()


def _nro_remito(centro, numero):
    """Formatea como Magnus: '0002-00071407' (CompCentro-CompNumero)."""
    try:
        c = int(centro) if centro is not None else 0
    except (TypeError, ValueError):
        c = 0
    try:
        n = int(numero) if numero is not None else 0
    except (TypeError, ValueError):
        n = 0
    return f"{c:04d}-{n:08d}"


def fetch_remitos_ingreso(desde=None, hasta=None):
    """Agrega por artículo los remitos de ingreso x OC ya concretados.

    desde = 'YYYY-MM-DD' (o None → hoy - INGRESOS_DIAS_DEFAULT): solo remitos
    con FecComprobante >= esa fecha. /ventas/faltantes pasa la fecha del
    faltante (regla: el artículo "llegó" si hay remito con fecha >= a cuando
    se detectó el faltante).
    hasta = 'YYYY-MM-DD' opcional: acota también por arriba (FecComprobante
    <= hasta). Usado por /compras/metricas para acotar a un mes calendario
    exacto (sin esto, un remito de un mes futuro también contaría)."""
    if desde:
        try:
            corte = datetime.strptime(str(desde)[:10], "%Y-%m-%d").date()
        except ValueError:
            corte = date.today() - timedelta(days=INGRESOS_DIAS_DEFAULT)
    else:
        corte = date.today() - timedelta(days=INGRESOS_DIAS_DEFAULT)
    corte_dias = (corte - BASE_DATE).days

    hasta_dias = None
    if hasta:
        try:
            hasta_date = datetime.strptime(str(hasta)[:10], "%Y-%m-%d").date()
            hasta_dias = (hasta_date - BASE_DATE).days
        except ValueError:
            hasta_dias = None
    _hasta_cond = f"AND cab.FecComprobante <= {hasta_dias}" if hasta_dias is not None else ""

    sql = f"""
    SELECT
        cab.NroMovRemito             AS NroMovRemito,
        cab.CompCentro               AS CompCentro,
        cab.CompNumero               AS CompNumero,
        cab.FecComprobante           AS FecComprobante,
        cab.NroOrdCompra             AS NroOrdCompra,
        LTRIM(RTRIM(r.CodArticulo))  AS CodArticu,
        r.Cantidad                   AS Cantidad,
        pr.RazonSocial               AS Proveedor
    FROM EVERWEAR.dbo.Com_RemitoRenglones r
    INNER JOIN EVERWEAR.dbo.Com_RemitoCabecera cab ON cab.NroMovRemito = r.NroMovRemito
    LEFT  JOIN EVERWEAR.dbo.Com_Proveedores    pr  ON pr.CodProveed   = cab.CodProveed
    WHERE cab.NroOrdCompra <> 0
      AND cab.FecComprobante >= {corte_dias}
      {_hasta_cond}
      AND LTRIM(RTRIM(cab.Estado)) <> 'Anulado'
    """

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(sql)
        cols = [c[0] for c in cur.description]

        agg: dict[str, dict] = {}
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            cod = (str(d.get("CodArticu") or "")).strip()
            if not cod:
                continue
            fecha = _fecha_comprobante(d.get("FecComprobante"))
            if fecha is None:
                continue
            cant = float(_safe(d.get("Cantidad")) or 0)
            nro = _nro_remito(d.get("CompCentro"), d.get("CompNumero"))
            prov = (str(d.get("Proveedor") or "")).strip() or None

            a = agg.get(cod)
            if not a:
                a = {
                    "CodArticulo": cod,
                    "CantidadIngresada": 0.0,
                    "Proveedor": prov,
                    "FechaUltimoIngreso": fecha,
                    "NroRemitos": [],
                }
                agg[cod] = a
            a["CantidadIngresada"] += cant
            if prov and not a["Proveedor"]:
                a["Proveedor"] = prov
            if fecha > a["FechaUltimoIngreso"]:
                a["FechaUltimoIngreso"] = fecha
            if nro and nro not in a["NroRemitos"]:
                a["NroRemitos"].append(nro)

        rows = sorted(agg.values(), key=lambda x: -x["CantidadIngresada"])
        for r in rows:
            r["CantidadIngresada"] = round(r["CantidadIngresada"], 2)
        return {
            "total": len(rows),
            "rows": rows,
            "desde": corte.isoformat(),
            "hasta": (BASE_DATE + timedelta(days=hasta_dias)).isoformat() if hasta_dias is not None else None,
        }
    finally:
        conn.close()
