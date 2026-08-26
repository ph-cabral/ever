"""
Ventas de BULONERÍA (Magnus, SOLO LECTURA) — para /ventas/bulones.

Pedido de Pablo 2026-08-26: "una vista igual a /ventas/vendedor pero con
agregados". Las diferencias con ventas.py son TRES y sólo tres:

  1. TODO está filtrado a la línea BULONERÍA (Stk_Nivel1.Detalle LIKE
     'BULON%' — el LIKE evita depender del acento/plural exacto con el que
     está cargado el catálogo). Ninguna consulta de este módulo devuelve
     nada de otra línea.
  2. Como la línea es UNA sola, el eje "línea" pierde sentido y se
     reemplaza por el CÓDIGO PATRÓN (StkFer_Articulos.ArticuloPatron), que
     es el que agrupa los artículos adentro de la línea. Se muestra el
     código pelado (pedido de Pablo: "solo el código").
  3. Se agrega un tercer ranking: VENDEDORES. Click en un vendedor → sus
     clientes.

Fuente y criterio de "venta neta": IDÉNTICOS a ventas.py (Ven_CompCabecera +
Ven_CompRenglon, neto de nota de crédito según Ven_CodCom.DebitoCredito,
filtro cc.EvitaInformesYListados <> 1, mes = FecMovim del comprobante). Ver
el docstring de ventas.py y HANDOFF_extracciones_sql.md.

Gotchas heredados de ventas.py (NO tocar sin leer eso primero):
  · Las fechas van SIEMPRE como enteros Magnus (días desde 1800-12-28)
    comparados contra vc.FecMovim. Nunca dbo.fecha_cla2sql(...) contra un
    parámetro de fecha (no filtra bien con el driver viejo) ni DATEADD en el
    SELECT (revienta la query entera si una fila tiene FecMovim basura).
  · El año/mes sale de un CASE de rangos enteros generado en Python
    (_case_anio_mes de ventas.py), no de YEAR()/MONTH().
  · Acceso por vendedor: un no-admin sólo ve los clientes cuyo "Vendedor por
    Defecto" fijo es su código (Clientes.Clasif_VendZona → Vendedor_Zona →
    Ped_Usu_Arma), mismo join que usa clientes.py.
"""
from datetime import date
import os
import time

from db import get_connection
from ventas import (
    BASE_DATE,
    _anio_vacio,
    _case_anio_mes,
    _resolver_rango,
    _round_anio,
    _safe,
)

# La línea a la que está acotada TODA esta vista. Se compara con LIKE contra
# Stk_Nivel1.Detalle: 'BULON%' matchea BULONERIA y BULONERÍA sin depender de
# cómo esté escrito en el catálogo. Overrideable por env por si algún día se
# quiere la misma vista para otra línea.
LINEA_LIKE = os.getenv("BULONES_LINEA_LIKE", "BULON%")

# Filtro de línea. Va sobre ap.Nivel1 (columna entera, sargable) resolviendo
# el nombre adentro de una subconsulta contra Stk_Nivel1 (82 filas) — mismo
# truco que _LINEA_COND_EXACTA en ventas.py.
COND_BULON = (
    "ap.Nivel1 IN (SELECT n.Nivel1 FROM Stk_Nivel1 n "
    f"WHERE LTRIM(RTRIM(n.Detalle)) LIKE '{LINEA_LIKE}')"
)

SIN_PATRON = "(Sin código patrón)"

# Los joins que agregan artículo + parámetros; son INNER porque el filtro de
# línea ya excluye lo que no matchea (un LEFT no sumaría filas útiles).
_JOIN_ART = """
JOIN StkFer_Articulos  s  ON s.CodArticulo    = r.CodArticu
JOIN StkFer_ArtParamet ap ON ap.ArticuloPatron = s.ArticuloPatron
"""

# Cartera del vendedor — se antepone a Ven_CompCabecera cuando hay que
# acotar por vendedor (no-admin) o agrupar POR vendedor.
_JOIN_VENDEDOR = """
FROM MAGNUS_SITD.dbo.Clientes c
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz ON vz.Clasif_VendZona = c.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma pu  ON LTRIM(RTRIM(pu.Usu_Arma_Nombre)) = LTRIM(RTRIM(vz.Vendedor))
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
"""

_JOIN_CLIENTE = """
FROM MAGNUS_SITD.dbo.Clientes c
JOIN Ven_CompCabecera vc ON vc.CodCliente = c.CodCliente
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
"""

_CANT = "CASE cc.DebitoCredito WHEN 1 THEN r.Cantidad ELSE r.Cantidad * -1 END"
_MONTO = (
    "CASE cc.DebitoCredito WHEN 1 THEN (r.Cantidad * r.PrecioVenta) "
    "ELSE (r.Cantidad * r.PrecioVenta) * -1 END"
)

_TTL_SEG = 15 * 60
_CACHE: dict[tuple, tuple[float, dict]] = {}


def _cacheado(key: tuple, forzar: bool):
    if forzar:
        return None
    hit = _CACHE.get(key)
    if hit is not None and (time.monotonic() - hit[0]) < _TTL_SEG:
        return hit[1]
    return None


def _guardar(key: tuple, valor: dict) -> dict:
    _CACHE[key] = (time.monotonic(), valor)
    return valor


def _conn():
    conn = get_connection("EVERWEAR")
    cur = conn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
    return conn, cur


# ──────────────────────────────────────────────────────────────────────────
# Rankings del pie (rango fijo de 12 meses, igual que /ventas/vendedor)
# ──────────────────────────────────────────────────────────────────────────
def fetch_top_clientes(vendedor: int | None = None, limit: int = 1_000_000,
                       desde: str | None = None, hasta: str | None = None,
                       forzar: bool = False) -> dict:
    """Clientes que compraron BULONERÍA en el rango, por monto ($) — gemelo
    de ventas.fetch_top_clientes pero acotado a la línea."""
    desde_ym, hasta_ym, d1, d2 = _resolver_rango(desde, hasta)
    limit_i = int(limit)
    key = ("cli", vendedor, limit_i, desde_ym, hasta_ym)
    hit = _cacheado(key, forzar)
    if hit is not None:
        return hit

    joins = _JOIN_VENDEDOR if vendedor is not None else _JOIN_CLIENTE
    where = "WHERE cc.EvitaInformesYListados <> 1 AND vc.FecMovim BETWEEN ? AND ?"
    params: tuple = (d1, d2)
    if vendedor is not None:
        where = "WHERE pu.Usu_Arma_Codigo = ? AND cc.EvitaInformesYListados <> 1 AND vc.FecMovim BETWEEN ? AND ?"
        params = (int(vendedor), d1, d2)
    sql = f"""
SELECT c.CodCliente, LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre, SUM({_MONTO}) AS MontoNeto
{joins}{_JOIN_ART}{where}
  AND {COND_BULON}
GROUP BY c.CodCliente, LTRIM(RTRIM(c.Cliente_Nombre))
HAVING SUM({_MONTO}) > 0
ORDER BY MontoNeto DESC
"""
    conn, cur = _conn()
    try:
        cur.execute(sql, params)
        clientes = [
            {
                "numero": int(cod),
                "nombre": (str(nom).strip() if nom else None),
                "monto": round(float(_safe(monto) or 0), 2),
            }
            for cod, nom, monto in cur.fetchall()
            if cod is not None
        ]
        return _guardar(key, {
            "desde": f"{desde_ym[0]:04d}-{desde_ym[1]:02d}",
            "hasta": f"{hasta_ym[0]:04d}-{hasta_ym[1]:02d}",
            "totalClientes": len(clientes),
            "porMonto": clientes[:limit_i],
        })
    finally:
        conn.close()


def fetch_top_patrones(vendedor: int | None = None, limit: int = 1_000_000,
                       desde: str | None = None, hasta: str | None = None,
                       forzar: bool = False) -> dict:
    """Ranking de CÓDIGOS PATRÓN de bulonería en el rango. Reemplaza al
    ranking de líneas de /ventas/vendedor (acá la línea es una sola, así que
    el corte útil es el patrón). Devuelve las dos listas ya ordenadas
    (porUnidades / porMonto) para que el botón $ | Unidades del front no
    refetchee, mismo contrato que ventas.fetch_top_lineas."""
    desde_ym, hasta_ym, d1, d2 = _resolver_rango(desde, hasta)
    limit_i = int(limit)
    key = ("pat", vendedor, limit_i, desde_ym, hasta_ym)
    hit = _cacheado(key, forzar)
    if hit is not None:
        return hit

    if vendedor is not None:
        joins, where, params = _JOIN_VENDEDOR, (
            "WHERE pu.Usu_Arma_Codigo = ? AND cc.EvitaInformesYListados <> 1 "
            "AND vc.FecMovim BETWEEN ? AND ?"
        ), (int(vendedor), d1, d2)
    else:
        joins, where, params = """
FROM Ven_CompCabecera vc
JOIN Ven_CompRenglon r   ON r.NroMovVenta = vc.NroMovVenta
JOIN Ven_CodCom cc       ON vc.CompCodigo = cc.CompCodigo
""", "WHERE cc.EvitaInformesYListados <> 1 AND vc.FecMovim BETWEEN ? AND ?", (d1, d2)

    sql = f"""
SELECT LTRIM(RTRIM(s.ArticuloPatron)) AS Patron,
       SUM({_CANT}) AS Unidades,
       SUM({_MONTO}) AS MontoNeto
{joins}{_JOIN_ART}{where}
  AND {COND_BULON}
GROUP BY LTRIM(RTRIM(s.ArticuloPatron))
"""
    conn, cur = _conn()
    try:
        cur.execute(sql, params)
        acum: dict[str, list[float]] = {}
        for patron, unid, monto in cur.fetchall():
            nombre = (str(patron or "").strip()) or SIN_PATRON
            a = acum.setdefault(nombre, [0.0, 0.0])
            a[0] += float(_safe(unid) or 0)
            a[1] += float(_safe(monto) or 0)
        items = {
            p: {"patron": p, "unidades": round(u, 2), "monto": round(m, 2)}
            for p, (u, m) in acum.items()
        }
        # Una nota de crédito puede dejar unidades > 0 con monto <= 0 (o al
        # revés), así que cada lista filtra por SU métrica — igual que
        # fetch_top_lineas.
        por_u = sorted((i for i in items.values() if i["unidades"] > 0),
                       key=lambda x: x["unidades"], reverse=True)
        por_m = sorted((i for i in items.values() if i["monto"] > 0),
                       key=lambda x: x["monto"], reverse=True)
        return _guardar(key, {
            "desde": f"{desde_ym[0]:04d}-{desde_ym[1]:02d}",
            "hasta": f"{hasta_ym[0]:04d}-{hasta_ym[1]:02d}",
            "totalPatrones": len(por_u),
            "totalPatronesMonto": len(por_m),
            "porUnidades": por_u[:limit_i],
            "porMonto": por_m[:limit_i],
        })
    finally:
        conn.close()


def fetch_top_vendedores(vendedor: int | None = None, limit: int = 1_000_000,
                         desde: str | None = None, hasta: str | None = None,
                         forzar: bool = False) -> dict:
    """Ranking de VENDEDORES por bulonería vendida a SU cartera (pedido de
    Pablo 2026-08-26, el agregado propio de esta vista). El vendedor de cada
    venta es el "Vendedor por Defecto" FIJO del cliente — el mismo criterio
    que ya usa el acceso por vendedor, no el vendedor que cargó el
    comprobante. Un no-admin sólo se ve a sí mismo."""
    desde_ym, hasta_ym, d1, d2 = _resolver_rango(desde, hasta)
    limit_i = int(limit)
    key = ("ven", vendedor, limit_i, desde_ym, hasta_ym)
    hit = _cacheado(key, forzar)
    if hit is not None:
        return hit

    where = "WHERE cc.EvitaInformesYListados <> 1 AND vc.FecMovim BETWEEN ? AND ?"
    params: tuple = (d1, d2)
    if vendedor is not None:
        where = "WHERE pu.Usu_Arma_Codigo = ? AND cc.EvitaInformesYListados <> 1 AND vc.FecMovim BETWEEN ? AND ?"
        params = (int(vendedor), d1, d2)
    sql = f"""
SELECT pu.Usu_Arma_Codigo AS Codigo,
       LTRIM(RTRIM(pu.Usu_Arma_Nombre)) AS Nombre,
       SUM({_CANT}) AS Unidades,
       SUM({_MONTO}) AS MontoNeto
{_JOIN_VENDEDOR}{_JOIN_ART}{where}
  AND {COND_BULON}
GROUP BY pu.Usu_Arma_Codigo, LTRIM(RTRIM(pu.Usu_Arma_Nombre))
"""
    conn, cur = _conn()
    try:
        cur.execute(sql, params)
        items = []
        for cod, nom, unid, monto in cur.fetchall():
            if cod is None:
                continue
            items.append({
                "codigo": int(cod),
                "nombre": (str(nom).strip() if nom else None),
                "unidades": round(float(_safe(unid) or 0), 2),
                "monto": round(float(_safe(monto) or 0), 2),
            })
        por_u = sorted((i for i in items if i["unidades"] > 0),
                       key=lambda x: x["unidades"], reverse=True)
        por_m = sorted((i for i in items if i["monto"] > 0),
                       key=lambda x: x["monto"], reverse=True)
        return _guardar(key, {
            "desde": f"{desde_ym[0]:04d}-{desde_ym[1]:02d}",
            "hasta": f"{hasta_ym[0]:04d}-{hasta_ym[1]:02d}",
            "totalVendedores": len(por_u),
            "totalVendedoresMonto": len(por_m),
            "porUnidades": por_u[:limit_i],
            "porMonto": por_m[:limit_i],
        })
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────────────────
# Detalle del modal — SIEMPRE la misma matriz año anterior / año actual con
# desglose mensual y las dos métricas, para que el front use una sola tabla
# (idéntico contrato que fetch_clientes_por_linea de ventas.py). Cambia sólo
# qué identifica la fila.
#
# En esta vista el modal es de UN SOLO NIVEL (pedido de Pablo 2026-08-26:
# "acá solo se abrirá un modal, no puede ir otro modal más"): las filas del
# modal NO son clickeables, así que cada una de estas funciones se llama
# desde el ranking del pie y nada más.
# ──────────────────────────────────────────────────────────────────────────
_WRAP = """
SELECT Clave, Nombre, AnioMes, SUM(Cant) AS Cant, SUM(Monto) AS Monto
FROM ({sub}) t
WHERE AnioMes IS NOT NULL
GROUP BY Clave, Nombre, AnioMes
"""


def _matriz(sub: str, params: tuple, anio_anterior: int, anio_actual: int):
    """Corre la subconsulta (que devuelve Clave/Nombre/AnioMes/Cant/Monto) y
    la vuelca en {clave: {nombre, anioAnterior, anioActual}} + totales."""
    conn, cur = _conn()
    try:
        cur.execute(_WRAP.format(sub=sub), params)
        filas: dict = {}
        tot_ant, tot_act = _anio_vacio(), _anio_vacio()
        for clave, nombre, anio_mes, cant, monto in cur.fetchall():
            if clave is None or anio_mes is None:
                continue
            anio, mes = divmod(int(anio_mes), 100)
            if anio not in (anio_actual, anio_anterior) or not 1 <= mes <= 12:
                continue
            cant = float(_safe(cant) or 0)
            monto = float(_safe(monto) or 0)
            b = filas.get(clave)
            if b is None:
                b = {
                    "clave": clave,
                    "nombre": (str(nombre).strip() if nombre else None),
                    "anioAnterior": _anio_vacio(),
                    "anioActual": _anio_vacio(),
                }
                filas[clave] = b
            for destino in (b["anioActual"] if anio == anio_actual else b["anioAnterior"],
                            tot_act if anio == anio_actual else tot_ant):
                destino["cantidad"] += cant
                destino["monto"] += monto
                destino["meses"][mes - 1]["cantidad"] += cant
                destino["meses"][mes - 1]["monto"] += monto
        out = []
        for b in filas.values():
            b["anioAnterior"] = _round_anio(b["anioAnterior"])
            b["anioActual"] = _round_anio(b["anioActual"])
            out.append(b)
        out.sort(key=lambda b: b["anioAnterior"]["monto"] + b["anioActual"]["monto"],
                 reverse=True)
        return out, {"anioAnterior": _round_anio(tot_ant), "anioActual": _round_anio(tot_act)}
    finally:
        conn.close()


def _anios_y_rango():
    hoy = date.today()
    a_act = hoy.year
    a_ant = a_act - 1
    return a_ant, a_act, (date(a_ant, 1, 1) - BASE_DATE).days, (date(a_act, 12, 31) - BASE_DATE).days


def fetch_clientes_por_patron(patron: str, vendedor: int | None = None,
                              limit: int = 1_000_000, forzar: bool = False) -> dict:
    """Ranking de clientes que compraron UN código patrón de bulonería, con
    los 2 años y el desglose mensual completo (el filtro YTD/Meses lo hace
    el front sobre lo ya traído, sin refetch)."""
    patron_norm = (patron or "").strip()
    if not patron_norm:
        raise ValueError("Falta 'patron'")
    a_ant, a_act, d1, d2 = _anios_y_rango()
    key = ("cxp", patron_norm, vendedor, int(limit), a_ant, a_act)
    hit = _cacheado(key, forzar)
    if hit is not None:
        return hit

    # ArticuloPatron se compara SIN LTRIM/RTRIM para que el índice sirva:
    # en SQL Server la comparación de char/varchar ignora los espacios de
    # cola, así que 'ABC   ' = 'ABC'.
    if vendedor is not None:
        joins = _JOIN_VENDEDOR
        where = ("WHERE pu.Usu_Arma_Codigo = ? AND cc.EvitaInformesYListados <> 1 "
                 "AND vc.FecMovim BETWEEN ? AND ? AND s.ArticuloPatron = ?")
        params = (int(vendedor), d1, d2, patron_norm)
    else:
        joins = _JOIN_CLIENTE
        where = ("WHERE cc.EvitaInformesYListados <> 1 "
                 "AND vc.FecMovim BETWEEN ? AND ? AND s.ArticuloPatron = ?")
        params = (d1, d2, patron_norm)
    sub = f"""
SELECT c.CodCliente AS Clave, LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre,
       {_case_anio_mes((a_ant, a_act))} AS AnioMes,
       {_CANT} AS Cant, {_MONTO} AS Monto
{joins}{_JOIN_ART}{where}
  AND {COND_BULON}
"""
    filas, totales = _matriz(sub, params, a_ant, a_act)
    clientes = [
        {"numero": int(f["clave"]), "nombre": f["nombre"],
         "anioAnterior": f["anioAnterior"], "anioActual": f["anioActual"]}
        for f in filas
    ]
    return _guardar(key, {
        "patron": patron_norm,
        "anioAnterior": a_ant,
        "anioActual": a_act,
        "tieneDatos": bool(clientes),
        "totalClientes": len(clientes),
        "clientes": clientes[: int(limit)],
        "totales": totales,
    })


def fetch_clientes_por_vendedor(cod_vendedor: int, limit: int = 1_000_000,
                                forzar: bool = False) -> dict:
    """Ranking de clientes de UN vendedor, en bulonería — lo que abre el
    modal al clickear un vendedor del ranking."""
    a_ant, a_act, d1, d2 = _anios_y_rango()
    key = ("cxv", int(cod_vendedor), int(limit), a_ant, a_act)
    hit = _cacheado(key, forzar)
    if hit is not None:
        return hit

    sub = f"""
SELECT c.CodCliente AS Clave, LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre,
       {_case_anio_mes((a_ant, a_act))} AS AnioMes,
       {_CANT} AS Cant, {_MONTO} AS Monto
{_JOIN_VENDEDOR}{_JOIN_ART}WHERE pu.Usu_Arma_Codigo = ?
  AND cc.EvitaInformesYListados <> 1
  AND vc.FecMovim BETWEEN ? AND ?
  AND {COND_BULON}
"""
    filas, totales = _matriz(sub, (int(cod_vendedor), d1, d2), a_ant, a_act)
    clientes = [
        {"numero": int(f["clave"]), "nombre": f["nombre"],
         "anioAnterior": f["anioAnterior"], "anioActual": f["anioActual"]}
        for f in filas
    ]
    return _guardar(key, {
        "vendedor": {"codigo": int(cod_vendedor), "nombre": fetch_vendedor_nombre(cod_vendedor)},
        "anioAnterior": a_ant,
        "anioActual": a_act,
        "tieneDatos": bool(clientes),
        "totalClientes": len(clientes),
        "clientes": clientes[: int(limit)],
        "totales": totales,
    })


def fetch_patrones_por_cliente(cod_cliente: int, vendedor: int | None = None,
                               limit: int = 1_000_000, forzar: bool = False) -> dict:
    """Ranking de códigos patrón de bulonería que compró UN cliente, más el
    VENDEDOR ASIGNADO a ese cliente (pedido de Pablo 2026-08-26: "en la
    vista de clientes … arriba agregar el vendedor asignado a ese cliente").

    `vendedor`: si se pasa (no-admin) y el cliente no es de su cartera, se
    devuelve vacío — mismo criterio de acceso que ventas.py."""
    a_ant, a_act, d1, d2 = _anios_y_rango()
    asignado = fetch_vendedor_de_cliente(cod_cliente)
    if vendedor is not None and (asignado is None or asignado["codigo"] != int(vendedor)):
        return {
            "cliente": {"codigo": int(cod_cliente), "nombre": None},
            "vendedorAsignado": None,
            "anioAnterior": a_ant, "anioActual": a_act,
            "tieneDatos": False, "permitido": False,
            "totalPatrones": 0, "patrones": [],
            "totales": {"anioAnterior": _anio_vacio(), "anioActual": _anio_vacio()},
        }

    key = ("pxc", int(cod_cliente), int(limit), a_ant, a_act)
    hit = _cacheado(key, forzar)
    if hit is not None:
        return hit

    sub = f"""
SELECT LTRIM(RTRIM(s.ArticuloPatron)) AS Clave,
       LTRIM(RTRIM(c.Cliente_Nombre)) AS Nombre,
       {_case_anio_mes((a_ant, a_act))} AS AnioMes,
       {_CANT} AS Cant, {_MONTO} AS Monto
{_JOIN_CLIENTE}{_JOIN_ART}WHERE c.CodCliente = ?
  AND cc.EvitaInformesYListados <> 1
  AND vc.FecMovim BETWEEN ? AND ?
  AND {COND_BULON}
"""
    filas, totales = _matriz(sub, (int(cod_cliente), d1, d2), a_ant, a_act)
    nombre_cliente = filas[0]["nombre"] if filas else None
    patrones = [
        {"patron": (f["clave"] or SIN_PATRON),
         "anioAnterior": f["anioAnterior"], "anioActual": f["anioActual"]}
        for f in filas
    ]
    return _guardar(key, {
        "cliente": {"codigo": int(cod_cliente), "nombre": nombre_cliente},
        "vendedorAsignado": asignado,
        "anioAnterior": a_ant,
        "anioActual": a_act,
        "tieneDatos": bool(patrones),
        "permitido": True,
        "totalPatrones": len(patrones),
        "patrones": patrones[: int(limit)],
        "totales": totales,
    })


# ──────────────────────────────────────────────────────────────────────────
# Catálogo mínimo de vendedores
# ──────────────────────────────────────────────────────────────────────────
SQL_VENDEDOR_DE_CLIENTE = """
SELECT pu.Usu_Arma_Codigo, LTRIM(RTRIM(pu.Usu_Arma_Nombre))
FROM MAGNUS_SITD.dbo.Clientes c
JOIN MAGNUS_SITD.dbo.Vendedor_Zona vz ON vz.Clasif_VendZona = c.Clasif_VendZona
JOIN MAGNUS_SITD.dbo.Ped_Usu_Arma pu  ON LTRIM(RTRIM(pu.Usu_Arma_Nombre)) = LTRIM(RTRIM(vz.Vendedor))
WHERE c.CodCliente = ?
"""

SQL_VENDEDOR_NOMBRE = """
SELECT LTRIM(RTRIM(Usu_Arma_Nombre))
FROM MAGNUS_SITD.dbo.Ped_Usu_Arma
WHERE Usu_Arma_Codigo = ?
"""


def fetch_vendedor_de_cliente(cod_cliente: int) -> dict | None:
    """{'codigo','nombre'} del Vendedor por Defecto de un cliente, o None
    (mostrador / sin Clasif_VendZona — ver clientes.fetch_vendedor_fijo_
    cliente, mismo join, acá además se trae el nombre para mostrarlo)."""
    conn, cur = _conn()
    try:
        cur.execute(SQL_VENDEDOR_DE_CLIENTE, (int(cod_cliente),))
        row = cur.fetchone()
        if not row or row[0] is None:
            return None
        return {"codigo": int(row[0]), "nombre": (str(row[1]).strip() if row[1] else None)}
    finally:
        conn.close()


def fetch_vendedor_nombre(cod_vendedor: int) -> str | None:
    conn, cur = _conn()
    try:
        cur.execute(SQL_VENDEDOR_NOMBRE, (int(cod_vendedor),))
        row = cur.fetchone()
        return (str(row[0]).strip() if row and row[0] else None)
    finally:
        conn.close()
