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
# Criterio de "pedido válido" (Cerrado/Facturado, blacklist de CompCodigo) —
# el MISMO que usa /ventas/pedidos-mes, para que "vendido" signifique lo mismo
# en toda la app (ver ventas.py, confirmado 2026-07-10).
from ventas import COMP_CODIGOS_EXCLUIDOS, _es_valido

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


# ── Consumo mensual de UN artículo + stock por depósito (/compras/consumo) ────
# Vista pedida por Pablo 2026-08-11: cod. artículo + rango de MESES →
# vendido por mes, total, promedio (total / meses del rango, incluidos los de
# venta 0), máximo, mínimo > 0, total/máximo, total/mínimo, y stock por
# depósito (1/2/3, EVERWEAR.Stk_ArticSucursalDeposito — mismo criterio que
# /deposito/stock, ver deposito.py ARSU_*).
#
# "Vendido" = CantidadPedida de VenFer_PedidoReng de pedidos VÁLIDOS
# (Cerrado/Facturado, sin la blacklist de CompCodigo) por FechaPedido de la
# cabecera — exactamente el mismo criterio que /ventas/pedidos-mes, pero
# filtrado a un solo CodArticu y agrupado por mes.

SQL_CONSUMO_ARTICULO = """
SELECT
    cab.FechaPedido                       AS FechaPedido,
    cab.CompCodigo                        AS CompCodigo,
    est.Ped_EstadoDescripcion             AS Estado,
    r.CantidadPedida                      AS Cantidad
FROM EVERWEAR.dbo.VenFer_PedidoReng r
INNER JOIN EVERWEAR.dbo.VenFer_PedidoCabecera cab ON cab.NroMovVenta = r.NroMovVenta
LEFT  JOIN MAGNUS_SITD.dbo.Pedido_Estados     est ON cab.EstadoPedido = est.Ped_Estado
WHERE LTRIM(RTRIM(r.CodArticu)) = ?
  AND cab.FechaPedido BETWEEN ? AND ?
"""

# Depósitos fijos 1/2/3 — mismos IDs confirmados que usa /deposito/stock
# (deposito.py DEPOSITOS). Se repiten acá para no importar media tabla de
# constantes; si algún día se agrega un depósito, actualizar en ambos lados.
CONSUMO_DEPOSITOS = (1, 2, 3)

SQL_STOCK_ARTICULO = """
SELECT a.Deposito, SUM(a.StkReal) AS Stock
FROM EVERWEAR.dbo.Stk_ArticSucursalDeposito a
WHERE LTRIM(RTRIM(a.CodArticulo)) = ?
GROUP BY a.Deposito
"""

SQL_NOMBRE_ARTICULO = """
SELECT TOP 1 ap.Detalle, s.DetalleMedida, s.UnidadMedida
FROM EVERWEAR.dbo.[StkFer_Articulos] s
LEFT JOIN EVERWEAR.dbo.[StkFer_ArtParamet] ap ON ap.ArticuloPatron = s.ArticuloPatron
WHERE LTRIM(RTRIM(s.CodArticulo)) = ?
"""


def _meses_rango(desde: str, hasta: str) -> list[str]:
    """['2026-03', '2026-04', ...] entre desde y hasta (YYYY-MM, inclusive)."""
    y1, m1 = int(desde[:4]), int(desde[5:7])
    y2, m2 = int(hasta[:4]), int(hasta[5:7])
    if (y1, m1) > (y2, m2):
        (y1, m1), (y2, m2) = (y2, m2), (y1, m1)
    out = []
    y, m = y1, m1
    while (y, m) <= (y2, m2):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


def fetch_consumo_articulo(codigo: str, desde: str, hasta: str):
    """Consumo mensual de `codigo` en el rango de meses [desde, hasta]
    (formato YYYY-MM) + stock actual por depósito.

    Devuelve SIEMPRE un bucket por cada mes del rango (cantidad 0 si no se
    vendió) — el promedio divide por la cantidad de meses del rango, no por
    los meses con venta. FechaPedido es int días-Magnus (BASE_DATE), así que
    el rango se filtra directo en SQL como enteros (mismo patrón que
    fetch_pedidos_mes)."""
    cod = (codigo or "").strip()
    if not cod:
        raise ValueError("codigo vacío")

    meses = _meses_rango(str(desde)[:7], str(hasta)[:7])
    y1, m1 = int(meses[0][:4]), int(meses[0][5:7])
    y2, m2 = int(meses[-1][:4]), int(meses[-1][5:7])
    d1 = date(y1, m1, 1)
    d2 = (date(y2 + 1, 1, 1) if m2 == 12 else date(y2, m2 + 1, 1)) - timedelta(days=1)
    d1n = (d1 - BASE_DATE).days
    d2n = (d2 - BASE_DATE).days

    por_mes: dict[str, float] = {m: 0.0 for m in meses}
    nombre = None
    stock_por_dep: dict[int, float] = {d: 0.0 for d in CONSUMO_DEPOSITOS}

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")

        cur.execute(SQL_CONSUMO_ARTICULO, (cod, d1n, d2n))
        cols = [c[0] for c in cur.description]
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
            fec = _to_date(d.get("FechaPedido"))
            if fec is None:
                continue
            key = f"{fec.year:04d}-{fec.month:02d}"
            if key not in por_mes:
                continue
            por_mes[key] += float(_safe(d.get("Cantidad")) or 0)

        # Nombre del artículo (para confirmar en la vista que el código existe)
        cur.execute(SQL_NOMBRE_ARTICULO, (cod,))
        row = cur.fetchone()
        if row:
            nombre = " ".join(
                " ".join(str(_safe(x) or "").strip() for x in row).split()
            ) or None

        # Stock actual por depósito (1/2/3)
        cur.execute(SQL_STOCK_ARTICULO, (cod,))
        for dep, stk in cur.fetchall():
            try:
                dep_i = int(dep)
            except (TypeError, ValueError):
                continue
            if dep_i in stock_por_dep:
                stock_por_dep[dep_i] = float(_safe(stk) or 0)
    finally:
        conn.close()

    cantidades = [round(por_mes[m], 2) for m in meses]
    total = round(sum(cantidades), 2)
    n_meses = len(meses)
    promedio = round(total / n_meses, 2) if n_meses else 0.0
    maximo = max(cantidades) if cantidades else 0.0
    positivos = [c for c in cantidades if c > 0]
    minimo = min(positivos) if positivos else None
    return {
        "codigo": cod,
        "nombre": nombre,
        "desde": meses[0],
        "hasta": meses[-1],
        "mesesEnRango": n_meses,
        "meses": [{"mes": m, "cantidad": round(por_mes[m], 2)} for m in meses],
        "totalVendido": total,
        "promedio": promedio,
        "maximo": maximo,
        "totalSobreMaximo": round(total / maximo, 2) if maximo > 0 else None,
        "minimo": minimo,
        "totalSobreMinimo": round(total / minimo, 2) if minimo else None,
        "stock": {
            "porDeposito": [
                {"deposito": d, "stock": round(stock_por_dep[d], 2)}
                for d in CONSUMO_DEPOSITOS
            ],
            "total": round(sum(stock_por_dep.values()), 2),
        },
    }


# ── Consumo mensual de TODOS los artículos + stock (vista "Tabla") ───────────
# Pedido de Pablo 2026-08-11 (mismo día que fetch_consumo_articulo, arriba):
# botón en /compras/consumo para alternar de "un artículo" a una TABLA con
# todos los artículos del rango, una fila por artículo, paginada de a 20 y
# ordenable por Código/Stock/Vendido/Promedio/Máximo/Mínimo en el front.
#
# Mismo criterio de "vendido" y de stock que fetch_consumo_articulo, pero sin
# filtrar por CodArticu — se trae TODO el rango, agrupado por artículo+mes
# (ver NOTA rendimiento abajo). Solo se listan artículos con alguna venta en
# el rango O con stock actual > 0 en algún depósito (evita listar SKUs de
# baja sin stock ni movimiento).
#
# NOTA rendimiento (2026-08-12, timeout real reportado por Pablo): traer CADA
# renglón de pedido de TODA la empresa para sumar en Python era demasiado
# lento (>45s, nunca llegaba a responder). Se mueve el SUM a SQL Server,
# agrupando por (artículo, año, mes, CompCodigo, Estado) — el filtrado
# (blacklist de comprobantes + _es_valido) se sigue haciendo en Python, IGUAL
# que en fetch_consumo_articulo, así que el criterio de "vendido" no cambia;
# solo se reduce drásticamente la cantidad de filas que viajan de SQL Server a
# Python (de un renglón por pedido a un renglón por artículo+mes+combinación
# de comprobante/estado). Año/mes se reconstruyen con DATEADD a partir del
# mismo FechaPedido int-días-desde-1800-12-28 que ya usa el resto de este
# archivo (confirmado: la versión de un solo artículo ya compara ese mismo
# campo contra enteros directamente, sin CAST).
SQL_CONSUMO_TODOS = """
SELECT
    LTRIM(RTRIM(r.CodArticu))                                     AS CodArticu,
    DATEPART(year,  DATEADD(day, cab.FechaPedido, '1800-12-28'))  AS Anio,
    DATEPART(month, DATEADD(day, cab.FechaPedido, '1800-12-28'))  AS Mes,
    cab.CompCodigo                                                 AS CompCodigo,
    est.Ped_EstadoDescripcion                                      AS Estado,
    SUM(r.CantidadPedida)                                          AS Cantidad
FROM EVERWEAR.dbo.VenFer_PedidoReng r
INNER JOIN EVERWEAR.dbo.VenFer_PedidoCabecera cab ON cab.NroMovVenta = r.NroMovVenta
LEFT  JOIN MAGNUS_SITD.dbo.Pedido_Estados     est ON cab.EstadoPedido = est.Ped_Estado
WHERE cab.FechaPedido BETWEEN ? AND ?
GROUP BY LTRIM(RTRIM(r.CodArticu)),
         DATEPART(year,  DATEADD(day, cab.FechaPedido, '1800-12-28')),
         DATEPART(month, DATEADD(day, cab.FechaPedido, '1800-12-28')),
         cab.CompCodigo,
         est.Ped_EstadoDescripcion
"""

SQL_STOCK_TODOS = """
SELECT LTRIM(RTRIM(a.CodArticulo)) AS CodArticulo, a.Deposito, SUM(a.StkReal) AS Stock
FROM EVERWEAR.dbo.Stk_ArticSucursalDeposito a
GROUP BY LTRIM(RTRIM(a.CodArticulo)), a.Deposito
"""

SQL_NOMBRES_CHUNK = """
SELECT LTRIM(RTRIM(s.CodArticulo)) AS CodArticulo, ap.Detalle, s.DetalleMedida, s.UnidadMedida
FROM EVERWEAR.dbo.[StkFer_Articulos] s
LEFT JOIN EVERWEAR.dbo.[StkFer_ArtParamet] ap ON ap.ArticuloPatron = s.ArticuloPatron
WHERE LTRIM(RTRIM(s.CodArticulo)) IN ({ph})
"""


# Columnas ordenables desde el front (whitelist — nunca se interpola el sort
# del cliente directo en SQL/Python, se mapea contra esto).
_SORT_KEYS = ("codigo", "stock", "totalVendido", "promedio", "maximo", "minimo")


def fetch_consumo_articulos(
    desde: str,
    hasta: str,
    sort: str = "totalVendido",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
):
    """Igual que fetch_consumo_articulo pero para TODOS los artículos a la
    vez: vendido por mes, total, promedio, máximo, mínimo > 0 y stock actual
    (1+2+3), uno por artículo — ORDENADO Y PAGINADO EN EL SERVIDOR (de a
    `page_size`, default 20).

    NOTA (2026-08-12, segundo incidente real): la primera versión traía el
    catálogo COMPLETO (nombre incluido) en cada respuesta y el front paginaba
    en el navegador — con un catálogo grande eso tira abajo el proceso
    (killed a mitad de respuesta, sin log de uvicorn: 'other side closed').
    Ahora los números (vendido/promedio/máximo/mínimo/stock) SÍ se calculan
    para todo el catálogo filtrado por `q` — hace falta para poder ordenar
    correctamente — pero eso es liviano (son floats, no texto). El nombre del
    artículo (la parte pesada: join a StkFer_Articulos) se busca SOLO para
    los `page_size` códigos de la página pedida, así la respuesta nunca crece
    con el tamaño del catálogo."""
    meses = _meses_rango(str(desde)[:7], str(hasta)[:7])
    y1, m1 = int(meses[0][:4]), int(meses[0][5:7])
    y2, m2 = int(meses[-1][:4]), int(meses[-1][5:7])
    d1 = date(y1, m1, 1)
    d2 = (date(y2 + 1, 1, 1) if m2 == 12 else date(y2, m2 + 1, 1)) - timedelta(days=1)
    d1n = (d1 - BASE_DATE).days
    d2n = (d2 - BASE_DATE).days
    n_meses = len(meses)
    meses_set = set(meses)

    sort = sort if sort in _SORT_KEYS else "totalVendido"
    reverse = str(sort_dir).lower() != "asc"
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 20), 200))  # tope defensivo

    ventas: dict[str, dict[str, float]] = {}
    stock_por_dep: dict[str, dict[int, float]] = {}

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")

        cur.execute(SQL_CONSUMO_TODOS, (d1n, d2n))
        cols = [c[0] for c in cur.description]
        # Ya viene agrupado por (artículo, año, mes, CompCodigo, Estado) —
        # muchas menos filas que un renglón por pedido. El filtrado (blacklist
        # de comprobantes + _es_valido) se hace acá, IGUAL que en
        # fetch_consumo_articulo, así que el criterio de "vendido" es el mismo.
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            cod = (str(d.get("CodArticu") or "")).strip()
            if not cod:
                continue
            try:
                comp = int(d.get("CompCodigo")) if d.get("CompCodigo") is not None else None
            except (TypeError, ValueError):
                comp = None
            if comp in COMP_CODIGOS_EXCLUIDOS:
                continue
            if not _es_valido(d.get("Estado")):
                continue
            try:
                anio = int(d.get("Anio"))
                mes_n = int(d.get("Mes"))
            except (TypeError, ValueError):
                continue
            key = f"{anio:04d}-{mes_n:02d}"
            if key not in meses_set:
                continue
            m = ventas.get(cod)
            if m is None:
                m = {mes: 0.0 for mes in meses}
                ventas[cod] = m
            m[key] += float(_safe(d.get("Cantidad")) or 0)

        cur.execute(SQL_STOCK_TODOS)
        for cod, dep, stk in cur.fetchall():
            cod = (str(cod or "")).strip()
            if not cod:
                continue
            try:
                dep_i = int(dep)
            except (TypeError, ValueError):
                continue
            if dep_i not in CONSUMO_DEPOSITOS:
                continue
            d = stock_por_dep.get(cod)
            if d is None:
                d = {dd: 0.0 for dd in CONSUMO_DEPOSITOS}
                stock_por_dep[cod] = d
            d[dep_i] += float(_safe(stk) or 0)

        codigos = sorted(set(ventas.keys()) | set(stock_por_dep.keys()))
        ql = (q or "").strip().lower()
        if ql:
            codigos = [c for c in codigos if ql in c.lower()]

        # Métricas por artículo — SOLO números (livianos), para TODO el
        # universo filtrado por `q`: hace falta calcular todos para poder
        # ordenar bien, pero no se le busca nombre a ninguno todavía.
        metrics = []
        for cod in codigos:
            ventas_cod = ventas.get(cod)
            cantidades = [round(ventas_cod[m], 2) for m in meses] if ventas_cod else [0.0] * n_meses
            total = round(sum(cantidades), 2)
            promedio = round(total / n_meses, 2) if n_meses else 0.0
            maximo = max(cantidades) if cantidades else 0.0
            positivos = [c for c in cantidades if c > 0]
            minimo = min(positivos) if positivos else None
            stock_total = round(sum(stock_por_dep.get(cod, {}).values()), 2)
            metrics.append({
                "codigo": cod,
                "totalVendido": total,
                "promedio": promedio,
                "maximo": maximo,
                "minimo": minimo,
                "stock": stock_total,
            })

        if sort == "codigo":
            metrics.sort(key=lambda r: r["codigo"], reverse=reverse)
        else:
            metrics.sort(key=lambda r: (r[sort] if r[sort] is not None else -1), reverse=reverse)

        total_items = len(metrics)
        total_pages = max(1, -(-total_items // page_size))  # ceil
        page = min(page, total_pages)
        start = (page - 1) * page_size
        page_rows = metrics[start:start + page_size]

        # Nombre del artículo: SOLO para los códigos de esta página (máx.
        # page_size, nunca todo el catálogo) — es la parte pesada (join a
        # StkFer_Articulos/StkFer_ArtParamet).
        page_codes = [r["codigo"] for r in page_rows]
        nombres: dict[str, str] = {}
        if page_codes:
            ph = ",".join("?" for _ in page_codes)
            cur.execute(SQL_NOMBRES_CHUNK.format(ph=ph), page_codes)
            for cod, detalle, dmed, umed in cur.fetchall():
                cod = (str(cod or "")).strip()
                nombre = " ".join(
                    " ".join(str(_safe(x) or "").strip() for x in (detalle, dmed, umed)).split()
                ) or None
                if nombre:
                    nombres[cod] = nombre
        for r in page_rows:
            r["nombre"] = nombres.get(r["codigo"])
    finally:
        conn.close()

    return {
        "desde": meses[0],
        "hasta": meses[-1],
        "mesesEnRango": n_meses,
        "total": total_items,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
        "sort": sort,
        "sortDir": "asc" if not reverse else "desc",
        "articulos": page_rows,
    }
