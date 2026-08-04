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
    cab.FecMovim                          AS FecMovim,
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

# Fecha de corte por defecto: solo se cruzan las OC hechas (FecMovim) desde acá.
# Antes de esto Magnus tiene OC viejas con saldo pendiente que NO deben cubrir
# faltantes actuales. Se puede pisar con ?desde=YYYY-MM-DD.
OC_DESDE_DEFAULT = "2026-06-26"


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


def _to_date(v):
    """FecMovim → date. Magnus puede guardarlo como int (días desde BASE_DATE) o
    como date/datetime. Devuelve None si no se puede interpretar."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date() if v.year >= 1901 else None
    if isinstance(v, date):
        return v if v.year >= 1901 else None
    try:
        dias = int(v)
    except (TypeError, ValueError):
        return None
    if dias <= 0:
        return None
    return BASE_DATE + timedelta(days=dias)


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


def fetch_ordenes_pendientes(desde=None):
    """Agrega por artículo lo pendiente de recibir de las OC.

    desde = 'YYYY-MM-DD' (o None → OC_DESDE_DEFAULT): solo se toman las OC cuyo
    FecMovim (fecha en que se hizo la orden) sea >= a esa fecha. Así las OC viejas
    con saldo pendiente no cubren faltantes actuales."""
    corte = None
    desde = desde or OC_DESDE_DEFAULT
    if desde:
        try:
            corte = datetime.strptime(str(desde)[:10], "%Y-%m-%d").date()
        except ValueError:
            corte = None

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
            # fecha de la orden (FecMovim) — se usa para el corte y también se
            # expone como FechaOC (más temprana) para que los consumidores
            # puedan armar un arribo estimado (FechaOC + N días) cuando no hay
            # FecEntregaPactada confiable (Importacion=True, FechaEntrega=None).
            fmov = _to_date(d.get("FecMovim"))
            if corte is not None:
                if fmov is None or fmov < corte:
                    continue
            pend = float(_safe(d.get("CantPedida")) or 0) - float(_safe(d.get("CantRecibida")) or 0)
            if pend <= 0:
                continue
            fecha = _fecha_entrega(d.get("FechaEntrega"))
            fmov_iso = fmov.isoformat() if fmov else None
            nro = _nro_oc(d.get("CompCentro"), d.get("NroOC"))
            prov = (str(d.get("Proveedor") or "")).strip() or None

            a = agg.get(cod)
            if not a:
                a = {
                    "CodArticulo": cod,
                    "PorLlegar": 0.0,
                    "Proveedor": prov,
                    "FechaEntrega": fecha,    # se queda con la más temprana
                    "FechaOC": fmov_iso,      # fecha de la OC (FecMovim) más temprana
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
            if fmov_iso and (a["FechaOC"] is None or fmov_iso < a["FechaOC"]):
                a["FechaOC"] = fmov_iso
            if nro and nro not in a["NroOCs"]:
                a["NroOCs"].append(nro)

        rows = sorted(agg.values(), key=lambda x: -x["PorLlegar"])
        for r in rows:
            r["PorLlegar"] = round(r["PorLlegar"], 2)
        return {
            "total": len(rows),
            "rows": rows,
            "desde": corte.isoformat() if corte else None,
        }
    finally:
        conn.close()


def fetch_ordenes_articulos_rango(desde: str, hasta: str):
    """Artículos con al menos un renglón de Orden de Compra HECHA en el rango
    [desde, hasta] (por FecMovim de la cabecera) — a diferencia de
    fetch_ordenes_pendientes, ACÁ NO importa si ya se recibió o sigue
    pendiente: solo interesa si la OC se generó ese período.

    Para /compras/metricas (funnel mensual: de los artículos faltantes del
    mes, cuántos tuvieron una OC ese mismo mes). Devuelve solo la lista de
    CodArticulo distintos (no cantidades) — es lo único que necesita el funnel.

    NOTA rendimiento/riesgo: igual que fetch_ordenes_pendientes, NO hay filtro
    de fecha en el WHERE de SQL — FecMovim puede venir como int días-Magnus o
    como datetime nativo según el entorno, y _to_date ya resuelve ambos casos
    en Python (mismo patrón ya probado en producción en esta función hermana).
    Acá se pierde el filtro por "pendiente" que acotaba el volumen en esa
    función, así que esta consulta trae MÁS filas (toda OC histórica). Si se
    vuelve lento, agregar un corte adicional (p.ej. NroOrdCompra >= umbral).
    """
    d1 = datetime.strptime(str(desde)[:10], "%Y-%m-%d").date()
    d2 = datetime.strptime(str(hasta)[:10], "%Y-%m-%d").date()

    sql = """
    SELECT
        cab.FecMovim                  AS FecMovim,
        LTRIM(RTRIM(r.CodArticulo))   AS CodArticu
    FROM EVERWEAR.dbo.Com_OrdCompRenglones r
    INNER JOIN EVERWEAR.dbo.Com_OrdCompCabecera cab ON cab.NroOrdCompra = r.NroOrdCompra
    """

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(sql)
        cols = [c[0] for c in cur.description]

        arts: set[str] = set()
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            cod = (str(d.get("CodArticu") or "")).strip()
            if not cod:
                continue
            fmov = _to_date(d.get("FecMovim"))
            if fmov is None or fmov < d1 or fmov > d2:
                continue
            arts.add(cod)

        return {
            "total": len(arts),
            "articulos": sorted(arts),
            "desde": d1.isoformat(),
            "hasta": d2.isoformat(),
        }
    finally:
        conn.close()


def fetch_compras_valorizado(desde: str, hasta: str):
    """Unidades y $ de las Órdenes de Compra HECHAS en [desde, hasta] (por
    FecMovim de la cabecera) — mismo criterio que fetch_ordenes_articulos_rango
    (no importa si el renglón ya se recibió o sigue pendiente), pero acá SÍ se
    suman cantidades y se valoriza en $.

    El $ NO sale de la OC: Com_OrdCompRenglones no expone acá un costo de
    compra confiable, y aunque lo tuviera, el pedido explícito de Pablo
    (2026-08-04) es valorizar a precio de VENTA. Se usa el mismo criterio
    "no hay tabla de lista de precios en el proyecto" que ya usa deposito.py
    (fetch_faltantes_ot, /deposito/faltantes): el ÚLTIMO PrecioVenta visto
    para ese CodArticulo en CUALQUIER pedido de Ven_PedRenPendientes.
    Aproximado a propósito: puede no reflejar el precio vigente si cambió
    después del último pedido con ese artículo; los artículos sin ningún
    PrecioVenta encontrado quedan valorizados en 0 y se cuentan en
    'articulosSinPrecio' (para poder avisar en la vista sin romperla).

    Para el selector de rango libre de /compras, independiente del mes del
    funnel de /compras/metricas.

    NOTA rendimiento/riesgo: igual que fetch_ordenes_articulos_rango, NO hay
    filtro de fecha en el WHERE de SQL (FecMovim puede venir como int
    días-Magnus o datetime nativo) — se filtra en Python con _to_date. Trae
    toda la OC histórica antes de filtrar; si se vuelve lento, agregar un
    corte adicional (p. ej. NroOrdCompra >= umbral)."""
    d1 = datetime.strptime(str(desde)[:10], "%Y-%m-%d").date()
    d2 = datetime.strptime(str(hasta)[:10], "%Y-%m-%d").date()

    sql = """
    SELECT
        cab.FecMovim                  AS FecMovim,
        LTRIM(RTRIM(r.CodArticulo))   AS CodArticu,
        r.Cantidad                    AS Cantidad
    FROM EVERWEAR.dbo.Com_OrdCompRenglones r
    INNER JOIN EVERWEAR.dbo.Com_OrdCompCabecera cab ON cab.NroOrdCompra = r.NroOrdCompra
    """

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(sql)
        cols = [c[0] for c in cur.description]

        unidades: dict[str, float] = {}
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            cod = (str(d.get("CodArticu") or "")).strip()
            if not cod:
                continue
            fmov = _to_date(d.get("FecMovim"))
            if fmov is None or fmov < d1 or fmov > d2:
                continue
            cant = float(_safe(d.get("Cantidad")) or 0)
            unidades[cod] = unidades.get(cod, 0.0) + cant

        # Precio de venta por artículo: último PrecioVenta visto en cualquier
        # pedido (Ven_PedRenPendientes), mismo patrón que deposito.py.
        precios: dict[str, float] = {}
        codigos = sorted(unidades.keys())
        if codigos:
            ph = ",".join("?" for _ in codigos)
            sql_precios = f"""
                SELECT CodArticu, PrecioVenta
                FROM (
                    SELECT LTRIM(RTRIM(CodArticu)) AS CodArticu, PrecioVenta,
                           ROW_NUMBER() OVER (
                               PARTITION BY LTRIM(RTRIM(CodArticu))
                               ORDER BY FecRegistracion DESC
                           ) AS rn
                    FROM EVERWEAR.dbo.[Ven_PedRenPendientes]
                    WHERE LTRIM(RTRIM(CodArticu)) IN ({ph})
                ) t
                WHERE rn = 1
            """
            cur.execute(sql_precios, codigos)
            for cod, precio in cur.fetchall():
                precios[(str(cod or "")).strip()] = float(_safe(precio) or 0)

        rows = []
        total_unidades = 0.0
        total_importe = 0.0
        sin_precio = 0
        for cod, cant in unidades.items():
            precio = precios.get(cod)
            if precio is None:
                sin_precio += 1
                precio = 0.0
            importe = round(cant * precio, 2)
            total_unidades += cant
            total_importe += importe
            rows.append({
                "CodArticulo": cod,
                "Cantidad": round(cant, 2),
                "PrecioVenta": precio,
                "Importe": importe,
            })
        rows.sort(key=lambda r: -r["Importe"])

        return {
            "desde": d1.isoformat(),
            "hasta": d2.isoformat(),
            "itemsDistintos": len(unidades),
            "unidadesCompradas": round(total_unidades, 2),
            "montoVenta": round(total_importe, 2),
            "articulosSinPrecio": sin_precio,
            "rows": rows,
        }
    finally:
        conn.close()
