"""
Mesa de Control — Productividad por Controlador (EVERWEAR, SOLO LECTURA).

Reproduce el reporte "CONTROL DE PRODUCTIVIDAD POR CONTROLADOR" llamando
directo al SP fuente: EVERWEAR.dbo.RPT_V325_ProductividadPorControlador
(agrupa por Centro de Preparación + Controlador, cuenta items controlados,
toma la fecha de CIERRE de pedido en CP). Ver control_extraccion.py (script
original que corría a mano en pc-0067, subido a mano por contaduría) — este
módulo lo expone como API para la vista /deposito (pestaña "Mesas de
Control"), llamando al SP UNA VEZ POR MES para poder comparar varios meses.

────────────────────────────────────────────────────────────────────────────
COLUMNAS DEL SP: sólo "CANTIDAD ITEMS CONTROLADOS" está CONFIRMADA (viene
literal de control_extraccion.py, validado contra el impreso de Mayo 2026).
El resto (columna de Centro de Preparación, código y nombre de Controlador)
se ubica por nombre en tiempo de ejecución — ver `_detectar_columnas()`.
PENDIENTE: correr GET /deposito/mesa-control/diag en producción una vez y,
si algo no coincide, clavar los nombres exactos ahí abajo en vez de
autodetectarlos.
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


def fetch_mesa_control(meses: list[str]) -> dict:
    """Corre el SP una vez por mes (`meses` = ['YYYY-MM', ...]) y agrega:
      · por_mes         = [{mes, total}]  (suma de todos los controladores/centros)
      · por_controlador = [{controlador, codigo, por_mes: {mes: cantidad}, total}]
    Meses sin datos (o sin corte pasado) quedan en 0. Solo lectura sobre EVERWEAR."""
    meses = sorted(set(m.strip() for m in meses if m.strip()))
    if not meses:
        return {
            "meses": [], "columnas_detectadas": None,
            "por_mes": [], "por_controlador": [], "total_general": 0,
        }

    por_mes: dict[str, int] = {m: 0 for m in meses}
    por_ctrl: dict[str, dict] = {}
    cols_detectadas: dict | None = None

    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd;")
        for mes in meses:
            d, h = _rango_mes(mes)
            if d > h:
                continue  # mes futuro, sin datos posibles
            _exec_sp(cur, d, h)
            cols, filas = _rows(cur)
            if cols_detectadas is None:
                cols_detectadas = _detectar_columnas(cols)
            det = cols_detectadas
            idx_cant = cols.index(det["cantidad"]) if det["cantidad"] else None
            idx_nom = cols.index(det["nombre"]) if det["nombre"] else None
            idx_cod = cols.index(det["codigo"]) if det["codigo"] else None

            for fila in filas:
                cant = int(fila[idx_cant] or 0) if idx_cant is not None else 0
                nombre = (
                    str(fila[idx_nom]).strip()
                    if idx_nom is not None and fila[idx_nom] is not None
                    else None
                )
                codigo = fila[idx_cod] if idx_cod is not None else None
                if not nombre:
                    nombre = f"Controlador {codigo}" if codigo is not None else "— Sin identificar"

                por_mes[mes] += cant
                entry = por_ctrl.setdefault(
                    nombre, {"controlador": nombre, "codigo": codigo, "por_mes": {}, "total": 0}
                )
                entry["por_mes"][mes] = entry["por_mes"].get(mes, 0) + cant
                entry["total"] += cant
    finally:
        conn.close()

    controladores = sorted(por_ctrl.values(), key=lambda x: -x["total"])
    return {
        "meses": meses,
        "columnas_detectadas": cols_detectadas,
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
