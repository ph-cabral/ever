"""
Registro de Errores — Mesa de Control (widget de escritorio). Insert en
Postgres (schema `deposito`, tabla `errores_mesa`; ver
ever/sql/deposito_errores_mesa.sql). El lookup por Nro Pedido es SOLO LECTURA:

  · Fecha + Tipo Pedido  ← EVERWEAR.dbo.VenFer_PedidoCabecera + MAGNUS_SITD.
    "Tipo Pedido" = nombre del comprobante (Ven_CodComprobante.DetalleCorto
    por CompCodigo, NO el código numérico) — mismo join que Comprobante_Desc
    en main.py/SQL_QUERY. Ajustado 2026-07-15 a pedido de Pablo: antes era
    el origen de venta (Web/Móvil/Acopio, Vta/Ped_OrigenRegistracion).
  · OT + N° Armador/Nombre ← WMS OT + Personal, mismo patrón que
    deposito.py (OT_COL_PEDIDO, P_Repositor / OTUsuarioGUID_Repositor).
  · Ubicación ← campo "Observaciones" de la pantalla de OT en WMS (confirmado
    con captura de Pablo: ahí anotan cosas como "Est 2 10" / "01-16-10-I").
    La columna real de OT se detecta sola por nombre (LIKE '%OBSERV%', ver
    _col_observaciones_ot) — mismo patrón "candidatos" que ya usa deposito.py
    (OT_candidatos_pedido) para no hardcodear un nombre sin confirmar.

REDISEÑO 2026-07-15 (a pedido de Pablo): se sacó el select de Mesa/Reclamos.
Ahora, al abrir el widget se pide un N° de operario (el controlador que está
parado en la mesa) y se resuelve su NOMBRE contra WMS.Personal — mismo origen
que "nombreArmador" (fetch_operario_nombre abajo) — UNA sola vez por sesión
del widget. Ese nombre va en la columna que antes era "aviso", ahora
"controlador". El widget ya no manda un texto de mesa: manda `nroOperario`
y el server resuelve el nombre (no confía en lo que mande el cliente).
"Detalle Error" sigue siendo un select manual — ver DETALLE_ERROR_OPCIONES.
"""
from datetime import date, timedelta

from db import get_connection
from db_pg import get_pg_connection
from deposito import OT_COL_PEDIDO

BASE_DATE = date(1800, 12, 28)

# ── Opciones fijas de los selects ─────────────────────────────────────────────
# Lista de arranque — AJUSTAR/COMPLETAR a gusto (sin tocar el widget).
DETALLE_ERROR_OPCIONES = [
    "Error en cantidad",
    "Error en producto",
    "Producto no conforme",
    "Pedido incompleto",
    "Producto sin identificación",
    "Pedido no encontrado",
    "Error de mesa",
    "Otro",
]

# ── Lookup (solo lectura) ─────────────────────────────────────────────────────
# "TipoPedido" = nombre del comprobante (ej. "Factura A"), no el código
# numérico — mismo join (CompCodigo -> Ven_CodComprobante.DetalleCorto) que
# Comprobante_Desc en main.py/SQL_QUERY.
SQL_PEDIDO_FECHA_TIPO = """
SELECT
    p.FechaPedido,
    cc.DetalleCorto AS TipoPedido
FROM EVERWEAR.dbo.VenFer_PedidoCabecera p
LEFT JOIN MAGNUS_SITD.dbo.Ven_CodComprobante cc ON p.CompCodigo = cc.CompCodigo
WHERE p.NroMovVenta = ?
"""

# Columna real de OT con la "Observaciones" (ubicación) — se detecta una sola
# vez por proceso (ver _col_observaciones_ot) y se cachea acá.
_ot_observ_col_cache: dict = {"col": None, "resolved": False}


def _col_observaciones_ot(conn) -> str | None:
    """Nombre real de la columna de OT que trae 'Observaciones' (ubicación
    tipo 'Est 2 10' / '01-16-10-I', ver captura de Pablo). Detección por
    nombre (LIKE '%OBSERV%'), no hardcodeada — mismo patrón que
    OT_candidatos_pedido en deposito.py. Cacheado en memoria del proceso."""
    if _ot_observ_col_cache["resolved"]:
        return _ot_observ_col_cache["col"]
    cur = conn.cursor()
    cur.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME = 'OT' AND COLUMN_NAME LIKE '%OBSERV%' "
        "ORDER BY COLUMN_NAME"
    )
    row = cur.fetchone()
    _ot_observ_col_cache["col"] = row[0] if row else None
    _ot_observ_col_cache["resolved"] = True
    return _ot_observ_col_cache["col"]


SQL_PEDIDO_OT_ARMADOR_BASE = f"""
SELECT TOP 1
    OT.OTId,
    P_Repositor.PersonalId     AS NroArmador,
    P_Repositor.PersonalNombre AS NombreArmador{{observ_select}}
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
LEFT JOIN Personal P_Repositor ON OT.OTUsuarioGUID_Repositor = P_Repositor.PersonalId
WHERE Codot.CodotProcesoNegocio = 4          -- Picking
  AND OT.{OT_COL_PEDIDO} = ?
ORDER BY OT.OTFechaHoraEjecucion DESC
"""


def fetch_pedido_lookup(nro_pedido: int) -> dict | None:
    """Fecha + Tipo Pedido (Magnus) + OT + N° Armador/Nombre + Ubicación (WMS),
    por Nro Pedido (NroMovVenta). None si el pedido no existe en Magnus."""
    conn = get_connection()  # default EVERWEAR
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_PEDIDO_FECHA_TIPO, (nro_pedido,))
        row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        return None
    fecha_int, tipo_pedido = row
    fecha = (BASE_DATE + timedelta(days=int(fecha_int))).isoformat() if fecha_int else None

    ot, nro_armador, nombre_armador, ubicacion = (None, None, None, None)
    conn = get_connection("WMS")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        observ_col = _col_observaciones_ot(conn)
        observ_select = f", OT.{observ_col} AS Ubicacion" if observ_col else ""
        cur.execute(SQL_PEDIDO_OT_ARMADOR_BASE.format(observ_select=observ_select), (nro_pedido,))
        cols = [c[0] for c in cur.description]
        ot_row = cur.fetchone()
        if ot_row:
            d = dict(zip(cols, ot_row))
            ot = d.get("OTId")
            nro_armador = d.get("NroArmador")
            nombre_armador = (d.get("NombreArmador") or "").strip() or None
            ubicacion = d.get("Ubicacion")
            if ubicacion is not None:
                ubicacion = str(ubicacion).strip() or None
    finally:
        conn.close()

    return {
        "nroPedido": nro_pedido,
        "fecha": fecha,
        "tipoPedido": (tipo_pedido or "").strip() or None,
        "ot": int(ot) if ot is not None else None,
        "nroArmador": int(nro_armador) if nro_armador is not None else None,
        "nombreArmador": nombre_armador,
        "ubicacion": ubicacion,
    }


# def fetch_operario_nombre(nro_operario: int) -> str | None:
#     """Nombre del operario/controlador por N° de Personal (WMS.Personal.
#     PersonalId) — mismo origen que nombreArmador arriba. Se resuelve UNA vez
#     al abrir el widget (pantalla de N° Operario), no por pedido. None si no
#     existe."""
#     conn = get_connection("WMS")
#     try:
#         cur = conn.cursor()
#         cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
#         cur.execute(
#             "SELECT PersonalNombre FROM Personal WHERE PersonalId = ?",
#             (str(nro_operario),),
#         )
#         row = cur.fetchone()
#     finally:
#         conn.close()
#     if not row:
#         return None
#     nombre = (row[0] or "").strip()
#     return nombre or None

def fetch_operario_nombre(nro_operario: int) -> str | None:
    conn = get_connection("WMS")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(
            "SELECT PersonalNombre FROM Personal WHERE PersonalId = ?",
            (str(nro_operario),),
        )
        row = cur.fetchone()
    finally:
        conn.close()
    if row:
        nombre = (row[0] or "").strip()
        if nombre:
            return nombre

    # fallback: usuarios de Magnus (controladores/mesa), no siempre están en WMS.Personal
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute("SELECT Nombre FROM dbo.Gen_Usuarios WHERE Numero = ?", (nro_operario,))
        row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    nombre = (row[0] or "").strip()
    return nombre or None


def fetch_ubicacion_diag(nro_pedido: int | None = None) -> dict:
    """Diagnóstico: qué columna de OT se detectó para 'Observaciones'/ubicación
    y, si se pasa nro_pedido, el valor real que trae para ese pedido. Para
    confirmar contra la pantalla de OT en WMS (ver captura de Pablo)."""
    conn = get_connection("WMS")
    try:
        col = _col_observaciones_ot(conn)
    finally:
        conn.close()
    out = {"columna_detectada": col}
    if nro_pedido is not None:
        out["lookup"] = fetch_pedido_lookup(nro_pedido)
    return out


# ── Insert (Postgres) ─────────────────────────────────────────────────────────
def insert_error_mesa(nro_pedido: int, nro_operario: int, detalle_error: str) -> dict:
    """Re-resuelve fecha/tipo/OT/armador del pedido + nombre del controlador
    (por nro_operario, WMS.Personal) del lado del server (no confía en lo que
    mande el cliente) e inserta 1 fila en deposito.errores_mesa."""
    detalle_error = (detalle_error or "").strip()
    if not nro_operario:
        raise ValueError("Falta 'nroOperario'")
    if not detalle_error:
        raise ValueError("Falta 'detalleError'")

    controlador = fetch_operario_nombre(nro_operario)
    if not controlador:
        raise ValueError(f"Operario {nro_operario} no encontrado")

    info = fetch_pedido_lookup(nro_pedido) or {
        "fecha": None, "tipoPedido": None, "ot": None,
        "nroArmador": None, "nombreArmador": None, "ubicacion": None,
    }

    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO deposito.errores_mesa
                ("nroPedido", fecha, "tipoPedido", ot, controlador, "nroArmador", "nombreArmador", ubicacion, "detalleError")
            VALUES (%s, CURRENT_DATE, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, "createdAt"
            """,
            (
                nro_pedido, info["tipoPedido"], info["ot"],
                controlador, info["nroArmador"], info["nombreArmador"], info["ubicacion"], detalle_error,
            ),
        )
        new_id, created_at = cur.fetchone()
        conn.commit()
    finally:
        conn.close()

    return {
        **info,
        "id": new_id,
        "controlador": controlador,
        "detalleError": detalle_error,
        "createdAt": created_at.isoformat(),
    }


# ── Widget Calidad (controla preparado + control) ─────────────────────────────
# A diferencia del widget de Mesa de Control (arriba), acá el controlador NO
# se tipea (no hay pantalla de N° Operario): se resuelve solo por Nro Pedido
# contra Magnus (Ven_PedImpresoCP.CodControlador1/2, mismo origen que
# mesa_control.py — cod1==cod2 confirmado ahí). A pedido de Pablo (2026-07-16):
# esta alta NO guarda preparador (nroArmador/nombreArmador quedan NULL).
SQL_CONTROLADOR_PEDIDO = """
SELECT TOP 1 CodControlador1, CodControlador2
FROM dbo.Ven_PedImpresoCP
WHERE NroMovVenta = ?
ORDER BY FechaControl DESC
"""


def fetch_controlador_pedido(nro_pedido: int) -> dict | None:
    """Controlador real del pedido (Magnus, atado a NroMovVenta). None si el
    pedido no tiene control registrado."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_CONTROLADOR_PEDIDO, (nro_pedido,))
        row = cur.fetchone()
        if not row:
            return None
        cod1, cod2 = row
        codigo = int(cod1) if cod1 and cod1 > 0 else (int(cod2) if cod2 and cod2 > 0 else None)
        if not codigo:
            return None
        cur.execute("SELECT Nombre FROM dbo.Gen_Usuarios WHERE Numero = ?", (codigo,))
        nrow = cur.fetchone()
        nombre = (nrow[0] or "").strip() if nrow else None
        return {"nroControlador": codigo, "nombreControlador": nombre or f"Controlador {codigo}"}
    finally:
        conn.close()


def insert_error_calidad(nro_pedido: int, nro_operario: int, detalle_error: str) -> dict:
    """Alta desde el widget de Calidad. NO guarda preparador (a diferencia de
    insert_error_mesa). `nro_operario` identifica a QUIEN CARGA el registro
    (pantalla de inicio del widget, igual que Mesa de Control) — se resuelve
    del lado del server (WMS.Personal, mismo origen que fetch_operario_nombre)
    y va en `registradoPor`, separado de `controlador` (que acá sale solo de
    Magnus, no lo tipea nadie). origen='calidad'."""
    detalle_error = (detalle_error or "").strip()
    if not nro_operario:
        raise ValueError("Falta 'nroOperario'")
    if not detalle_error:
        raise ValueError("Falta 'detalleError'")

    registrado_por = fetch_operario_nombre(nro_operario)
    if not registrado_por:
        raise ValueError(f"Operario {nro_operario} no encontrado")

    ctrl = fetch_controlador_pedido(nro_pedido)
    if not ctrl:
        raise ValueError(f"Pedido {nro_pedido} sin controlador registrado en Magnus")

    info = fetch_pedido_lookup(nro_pedido) or {"tipoPedido": None, "ot": None, "ubicacion": None}

    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO deposito.errores_mesa
                ("nroPedido", fecha, "tipoPedido", ot, controlador, ubicacion, "detalleError", origen, "registradoPor")
            VALUES (%s, CURRENT_DATE, %s, %s, %s, %s, %s, 'calidad', %s)
            RETURNING id, "createdAt"
            """,
            (
                nro_pedido, info["tipoPedido"], info["ot"], ctrl["nombreControlador"],
                info["ubicacion"], detalle_error, registrado_por,
            ),
        )
        new_id, created_at = cur.fetchone()
        conn.commit()
    finally:
        conn.close()

    return {
        "id": new_id, "nroPedido": nro_pedido, "tipoPedido": info["tipoPedido"],
        "ot": info["ot"], "ubicacion": info["ubicacion"], "controlador": ctrl["nombreControlador"],
        "detalleError": detalle_error, "origen": "calidad", "registradoPor": registrado_por,
        "createdAt": created_at.isoformat(),
    }


def opciones() -> dict:
    return {"detalleError": DETALLE_ERROR_OPCIONES}


def fetch_errores_mesa_list(
    desde: str | None = None, hasta: str | None = None, limit: int = 1000
) -> list[dict]:
    """Lista de deposito.errores_mesa para la vista /deposito (tab "Errores de
    Mesa"). Filtro opcional por rango de fecha (columna `fecha`, resuelta del
    lado del server al insertar). Controlador/Preparador se filtran del lado
    del cliente con selects poblados a partir de lo ya traído — mismo patrón
    que el filtro de Operario en app/deposito/page.tsx."""
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        where = []
        params: list = []
        if desde:
            where.append("fecha >= %s")
            params.append(desde)
        if hasta:
            where.append("fecha <= %s")
            params.append(hasta)
        sql = (
            'SELECT id, "nroPedido", fecha, "tipoPedido", ot, controlador, '
            '"nombreArmador", ubicacion, "detalleError", origen, "registradoPor", '
            'observacion, "createdAt" '
            "FROM deposito.errores_mesa"
        )
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += ' ORDER BY fecha DESC NULLS LAST, "createdAt" DESC LIMIT %s'
        params.append(limit)
        cur.execute(sql, params)
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        conn.close()

    for r in rows:
        if r.get("fecha") is not None:
            r["fecha"] = r["fecha"].isoformat()
        if r.get("createdAt") is not None:
            r["createdAt"] = r["createdAt"].isoformat()
    return rows


def update_observacion(error_id: int, observacion: str) -> dict:
    """Nota libre editable desde la vista web /deposito (columna al final de
    la tabla), no desde el widget de escritorio. Reemplaza el valor completo
    (no append)."""
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE deposito.errores_mesa SET observacion = %s WHERE id = %s RETURNING id",
            (observacion, error_id),
        )
        row = cur.fetchone()
        conn.commit()
    finally:
        conn.close()
    if not row:
        raise ValueError(f"Registro {error_id} no encontrado")
    return {"id": error_id, "observacion": observacion}
