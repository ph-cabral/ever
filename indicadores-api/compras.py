"""
Órdenes de Compra pendientes de recibir (Magnus, SOLO LECTURA).

Para /compras/faltantes: cuánto de cada artículo "va a llegar".
Eso es lo pendiente de recibir de las OC = Cantidad - CantidadCumplida.
Al leerlo en vivo, cuando entra la mercadería Magnus sube CantidadCumplida y el
pendiente baja solo; no hace falta escribir nada (a Magnus nunca se le escribe).

Tablas (EVERWEAR, confirmadas por descubrimiento):
  · Com_OrdCompCabecera  → NroOrdCompra, CompCentro, CodProveed, Estado, FecMovim
  · Com_OrdCompRenglones → NroOrdCompra, NroRenglon, CodArticulo, Cantidad,
                            CantidadCumplida, FecEntregaPactada
  · Com_Proveedores      → CodProveed, RazonSocial   (nombre del proveedor)

El CodArticulo del renglón es el mismo que usa /deposito/faltantes (p.CodArticu),
por eso cruzan por artículo.

NOTA (afinar si hace falta): se considera "por llegar" todo renglón con
Cantidad - CantidadCumplida > 0. No se filtra por Estado. Si aparecieran OC
ANULADAS con saldo pendiente, sumar su Estado a ESTADOS_CAB_EXCLUIR (abajo).
"""
from datetime import datetime, date, timedelta
from decimal import Decimal
from db import get_connection

BASE_DATE = date(1800, 12, 28)  # Magnus guarda fechas como días desde esta base

# Estados de CABECERA a excluir (p. ej. anuladas). Vacío = no excluir nada.
# Confirmar códigos reales con Com_SituacionOC / Com_OrdCompCabecera.Estado.
ESTADOS_CAB_EXCLUIR: tuple[int, ...] = ()

_EXCL = (
    f"AND cab.Estado NOT IN ({','.join(str(e) for e in ESTADOS_CAB_EXCLUIR)})"
    if ESTADOS_CAB_EXCLUIR else ""
)

# Renglones de OC con saldo pendiente de recibir (Cantidad - CantidadCumplida).
SQL_OC_PENDIENTES = f"""
SELECT
    cab.CompCentro                       AS CompCentro,
    cab.NroOrdCompra                     AS NroOC,
    LTRIM(RTRIM(r.CodArticulo))          AS CodArticu,
    r.Cantidad                           AS CantPedida,
    ISNULL(r.CantidadCumplida, 0)        AS CantRecibida,
    r.FecEntregaPactada                  AS FechaEntrega,
    pr.RazonSocial                       AS Proveedor
FROM EVERWEAR.dbo.Com_OrdCompRenglones r
INNER JOIN EVERWEAR.dbo.Com_OrdCompCabecera cab ON cab.NroOrdCompra = r.NroOrdCompra
LEFT  JOIN EVERWEAR.dbo.Com_Proveedores    pr  ON pr.CodProveed   = cab.CodProveed
WHERE ISNULL(r.Cantidad, 0) - ISNULL(r.CantidadCumplida, 0) > 0
  {_EXCL}
"""


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


def _fecha_entrega(v):
    """ISO yyyy-mm-dd o None. FecEntregaPactada = int (días Magnus).
    0 / sentinela ⇒ None ⇒ la vista lo muestra como 'Importación' (sin fecha aún)."""
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


def _nro_oc(centro, numero):
    """Formatea como en Magnus: '0001-00014349' (CompCentro-NroOrdCompra)."""
    try:
        c = int(centro) if centro is not None else 0
    except (TypeError, ValueError):
        c = 0
    try:
        n = int(numero) if numero is not None else 0
    except (TypeError, ValueError):
        n = 0
    return f"{c:04d}-{n:08d}"


def fetch_ordenes_pendientes():
    """Agrega por artículo lo pendiente de recibir de las OC."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_OC_PENDIENTES)
        cols = [c[0] for c in cur.description]

        agg: dict[str, dict] = {}
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            cod = (str(d.get("CodArticu") or "")).strip()
            if not cod:
                continue
            pend = float(_safe(d.get("CantPedida")) or 0) - float(_safe(d.get("CantRecibida")) or 0)
            if pend <= 0:
                continue
            fecha = _fecha_entrega(d.get("FechaEntrega"))
            nro = _nro_oc(d.get("CompCentro"), d.get("NroOC"))
            prov = (str(d.get("Proveedor") or "")).strip() or None

            a = agg.get(cod)
            if not a:
                a = {
                    "CodArticulo": cod,
                    "PorLlegar": 0.0,
                    "Proveedor": prov,
                    "FechaEntrega": fecha,    # se queda con la más temprana
                    "Importacion": False,
                    "NroOCs": [],
                }
                agg[cod] = a
            a["PorLlegar"] += pend
            if prov and not a["Proveedor"]:
                a["Proveedor"] = prov
            if fecha is None:
                a["Importacion"] = True       # algún renglón sin fecha ⇒ importación
            elif a["FechaEntrega"] is None or fecha < a["FechaEntrega"]:
                a["FechaEntrega"] = fecha
            if nro and nro not in a["NroOCs"]:
                a["NroOCs"].append(nro)

        rows = sorted(agg.values(), key=lambda x: -x["PorLlegar"])
        for r in rows:
            r["PorLlegar"] = round(r["PorLlegar"], 2)
        return {"total": len(rows), "rows": rows}
    finally:
        conn.close()
