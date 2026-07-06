"""
Mesa de Control — renglones (items) controlados por Controlador (EVERWEAR,
SOLO LECTURA), para la pestaña "Mesas de Control" de /deposito.

Origen: contaduría pidió reproducir el reporte "CONTROL DE PRODUCTIVIDAD POR
CONTROLADOR" (ver control_extraccion.py, script que corría a mano en
pc-0067) llamando al SP EVERWEAR.dbo.RPT_V325_ProductividadPorControlador.
CONFIRMADO (26-jun/2026, ver fetch_mesa_control_sp_definicion +
fetch_mesa_control_tablas_diag) que ese SP duplica: hace JOIN de
Ven_PedImpresoCP (1 fila/pedido) contra venfer_pedidoReng (1 fila/renglón)
SIN deduplicar, y además UNION ALL de CodControlador1 + CodControlador2 —
si un pedido tiene doble control, el total se cuenta 2 veces y NO reconcilia
contra lo facturado/preparado.

`fetch_mesa_control()` (la función que usa la API) YA NO llama al SP: hace
una consulta directa a Ven_PedImpresoCP + venfer_pedidoReng contando cada
renglón (NroMovVenta+NroRenglon) UNA sola vez para el total, y por separado
el desglose por controlador (que sí puede sumar más que el total si hubo
doble control — es crédito de productividad, no el total real).

Las funciones basadas en el SP (`_exec_sp`, `_detectar_columnas`,
`fetch_mesa_control_diag`) se dejan sólo como referencia/diagnóstico.
────────────────────────────────────────────────────────────────────────────
"""
from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal

from db import get_connection

SP_NOMBRE = "dbo.RPT_V325_ProductividadPorControlador"
CANTIDAD_COL = "CANTIDAD ITEMS CONTROLADOS"  # confirmada (control_extraccion.py)


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


def _rows(cur) -> tuple[list[str], list[list]]:
    cols = [c[0] for c in cur.description]
    return cols, [[_safe(v) for v in row] for row in cur.fetchall()]


def _rango_mes(mes: str) -> tuple[datetime, datetime]:
    """mes='YYYY-MM' -> (primer día 00:00:00, último día 23:59:59).
    Si el mes es el actual (o futuro), el 'hasta' se recorta a AHORA."""
    anio, mm = (int(x) for x in mes.split("-"))
    d = datetime(anio, mm, 1, 0, 0, 0)
    ultimo_dia = monthrange(anio, mm)[1]
    h = datetime(anio, mm, ultimo_dia, 23, 59, 59)
    ahora = datetime.now()
    if h > ahora:
        h = ahora
    return d, h


def _exec_sp(cur, desde: datetime, hasta: datetime) -> None:
    cur.execute(
        f"EXEC {SP_NOMBRE} "
        "@MOD_DFecha=?, @MOD_HFecha=?, "
        "@MOD_DCentroPreparacion=NULL, @MOD_HCentroPreparacion=NULL, "
        "@MOD_DControlador=NULL, @MOD_HControlador=NULL",
        (desde.strftime("%Y-%m-%d %H:%M:%S"), hasta.strftime("%Y-%m-%d %H:%M:%S")),
    )


def _detectar_columnas(cols: list[str]) -> dict:
    """Ubica por nombre las columnas de cantidad / centro / controlador
    (nombre y código). Sólo CANTIDAD_COL está confirmada; el resto es
    best-effort — confirmar con /deposito/mesa-control/diag."""
    up = {c: c.upper() for c in cols}
    cantidad = next((c for c in cols if up[c] == CANTIDAD_COL.upper()), None) \
        or next((c for c in cols if "CANTIDAD" in up[c]), None)
    centro = next((c for c in cols if "CENTRO" in up[c]), None)
    restantes = [c for c in cols if c not in (cantidad, centro)]
    nombre = next((c for c in restantes if "NOMBRE" in up[c]), None) \
        or next((c for c in restantes if "CONTROLADOR" in up[c]), None) \
        or (restantes[0] if restantes else None)
    codigo = next(
        (c for c in restantes if c != nombre and ("COD" in up[c] or "CONTROLADOR" in up[c])),
        None,
    )
    return {"cantidad": cantidad, "centro": centro, "nombre": nombre, "codigo": codigo}


# ── Conteo EXACTO (reemplaza al SP) ───────────────────────────────────────────
# El SP RPT_V325_ProductividadPorControlador (ver fetch_mesa_control_sp_definicion)
# hace JOIN de Ven_PedImpresoCP (1 fila por pedido) contra venfer_pedidoReng
# (1 fila por renglón/línea) SIN deduplicar, y encima UNION ALL de
# CodControlador1 + CodControlador2. Resultado: si un pedido tiene los DOS
# controladores cargados, TODOS sus renglones se cuentan 2 veces en el total
# general — no reconcilia contra lo facturado/preparado. Confirmado con
# GET /deposito/mesa-control/tablas-diag (columnas reales de ambas tablas):
#   Ven_PedImpresoCP:   NroMovVenta, CodCentroPrep, CodControlador1/2, FechaControl (int Clarion)
#   venfer_pedidoReng:  NroMovVenta, NroRenglon, CodCentroPrep, CodArticu, ...
# Acá contamos cada renglón (NroMovVenta+NroRenglon) UNA sola vez para el
# total; el desglose por controlador sí puede sumarle a los 2 controladores
# si el pedido tuvo doble control (créditos de productividad), pero eso ya
# NO infla el total general.
SQL_RENGLONES_CONTROLADOS = """
SELECT DISTINCT
    reng.NroMovVenta, reng.NroRenglon,
    ped.CodControlador1, ped.CodControlador2
FROM dbo.Ven_PedImpresoCP ped
JOIN dbo.venfer_pedidoReng reng
  ON ped.NroMovVenta   = reng.NroMovVenta
 AND ped.CodCentroPrep = reng.CodCentroPrep
WHERE (ped.CodControlador1 > 0 OR ped.CodControlador2 > 0)
  AND ped.FechaControl BETWEEN dbo.FECHA_SQL2Cla(?) AND dbo.FECHA_SQL2Cla(?)
"""

SQL_USUARIOS = "SELECT Numero, Nombre FROM dbo.Gen_Usuarios"


def _nombres_usuarios(conn) -> dict[int, str]:
    cur = conn.cursor()
    cur.execute(SQL_USUARIOS)
    return {int(r[0]): str(r[1]).strip() for r in cur.fetchall() if r[0] is not None}


def fetch_mesa_control(meses: list[str]) -> dict:
    """Cantidad EXACTA de renglones (items) controlados por mes + por
    controlador — consulta directa a las tablas fuente (no al SP, que
    duplica). `meses` = ['YYYY-MM', ...]. Devuelve:
      · por_mes         = [{mes, total}]  (renglones distintos, sin duplicar)
      · por_controlador = [{controlador, codigo, por_mes: {mes: cantidad}, total}]
        (puede sumar más que el total general si hubo doble control: un mismo
        renglón le suma a los 2 controladores, pero cuenta 1 sola vez en total_general)
    Solo lectura sobre EVERWEAR."""
    meses = sorted(set(m.strip() for m in meses if m.strip()))
    if not meses:
        return {"meses": [], "por_mes": [], "por_controlador": [], "total_general": 0}

    por_mes: dict[str, int] = {m: 0 for m in meses}
    por_ctrl: dict[int, dict] = {}

    conn = get_connection("EVERWEAR")
    try:
        nombres = _nombres_usuarios(conn)
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        for mes in meses:
            d, h = _rango_mes(mes)
            if d > h:
                continue  # mes futuro, sin datos posibles
            cur.execute(SQL_RENGLONES_CONTROLADOS, (d, h))
            filas = cur.fetchall()
            por_mes[mes] = len(filas)  # cada renglón cuenta 1 sola vez
            for _nro, _reng, cod1, cod2 in filas:
                for codigo in (cod1, cod2):
                    if codigo and codigo > 0:
                        codigo = int(codigo)
                        entry = por_ctrl.setdefault(
                            codigo,
                            {
                                "controlador": nombres.get(codigo, f"Controlador {codigo}"),
                                "codigo": codigo,
                                "por_mes": {},
                                "total": 0,
                            },
                        )
                        entry["por_mes"][mes] = entry["por_mes"].get(mes, 0) + 1
                        entry["total"] += 1
    finally:
        conn.close()

    controladores = sorted(por_ctrl.values(), key=lambda x: -x["total"])
    return {
        "meses": meses,
        "por_mes": [{"mes": m, "total": por_mes[m]} for m in meses],
        "por_controlador": controladores,
        "total_general": sum(por_mes.values()),
    }


# ── Diagnóstico: texto real del SP (para ubicar la tabla fuente y poder ──────
#    contar CADA ítem controlado UNA sola vez, filtrando por Nro. de Factura/
#    pedido interno, en vez de sumar por CodControlador1+CodControlador2).
def fetch_mesa_control_sp_definicion() -> dict:
    """Devuelve el texto T-SQL del SP (sys.sql_modules; si viene vacío, intenta
    sp_helptext). Con esto se identifica la tabla real de control (columnas de
    factura/pedido/renglón) para poder armar la consulta de conteo EXACTO
    (sin duplicar por doble controlador). No modifica nada, sólo lee metadata."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        texto = None
        try:
            cur.execute(
                "SELECT OBJECT_DEFINITION(OBJECT_ID(?))", (SP_NOMBRE,)
            )
            row = cur.fetchone()
            texto = row[0] if row else None
        except Exception:
            texto = None
        if not texto:
            try:
                cur.execute(f"EXEC sp_helptext '{SP_NOMBRE}'")
                texto = "".join(r[0] for r in cur.fetchall() if r[0])
            except Exception as ex:
                return {"sp": SP_NOMBRE, "definicion": None, "error": str(ex)}
        return {"sp": SP_NOMBRE, "definicion": texto}
    finally:
        conn.close()


SQL_COLS_TABLA = """
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = ?
ORDER BY ORDINAL_POSITION
"""


def fetch_mesa_control_tablas_diag() -> dict:
    """Columnas reales de Ven_PedImpresoCP y venfer_pedidoReng (las 2 tablas
    fuente del SP, según fetch_mesa_control_sp_definicion()). Sirve para
    ubicar la columna de renglón/línea en venfer_pedidoReng y así poder
    contar cada ítem controlado UNA sola vez (sin el fan-out del JOIN ni el
    UNION ALL por CodControlador1/CodControlador2 que hace el SP original)."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_COLS_TABLA, ("Ven_PedImpresoCP",))
        ped_cols = [{"col": r[0], "tipo": r[1]} for r in cur.fetchall()]
        cur.execute(SQL_COLS_TABLA, ("venfer_pedidoReng",))
        reng_cols = [{"col": r[0], "tipo": r[1]} for r in cur.fetchall()]
        return {
            "Ven_PedImpresoCP_columnas": ped_cols,
            "venfer_pedidoReng_columnas": reng_cols,
        }
    finally:
        conn.close()


def fetch_mesa_control_diag(mes: str | None = None) -> dict:
    """Corre el SP para UN mes (default: mes actual) y devuelve las columnas
    crudas + hasta 15 filas de muestra, para confirmar `_detectar_columnas()`."""
    mes = mes or datetime.now().strftime("%Y-%m")
    d, h = _rango_mes(mes)
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd;")
        _exec_sp(cur, d, h)
        cols, filas = _rows(cur)
    finally:
        conn.close()
    return {
        "mes": mes,
        "desde": d.isoformat(),
        "hasta": h.isoformat(),
        "columnas": cols,
        "columnas_detectadas": _detectar_columnas(cols),
        "filas_totales": len(filas),
        "muestra": [dict(zip(cols, f)) for f in filas[:15]],
    }
# (fin mesa_control.py)
