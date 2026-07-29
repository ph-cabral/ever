"""
Cola de asignación de pedidos — widget de Mesa de Control (a pedido de Pablo,
2026-07-29). Reemplaza el input manual de "Nro Pedido" del widget por un
botón "Asignar": en vez de tipear el pedido a mano, el operario reclama el
próximo pedido de una cola armada con el cruce:

    Cumplido en WMS (OT de Picking, OTEstado=2)
        ∩
    Abierto en Magnus (VenFer_PedidoCabecera.EstadoPedido -> Pedido_Estados
    Ped_EstadoDescripcion = 'Abierto')

cruzados por NroMovVenta ("número de movimiento", mismo campo que ya usa
fetch_pedido_lookup en errores_mesa.py vía OT.{OT_COL_PEDIDO}).

Tabla: deposito.control_asignacion (ver ever/sql/deposito_control_asignacion.sql
— correr ANTES de deployar este módulo).

ORDEN de la cola: "nroPedido" ascendente, empate por fecha descendente.
ASUNCIÓN (avisar a Pablo si el criterio real es otro): no se encontró en
Magnus/WMS un campo "Orden" separado de NroMovVenta/NroPedOrigen (son el
mismo valor, ver memoria magnus-ven-pedido-armador.md), así que acá "orden" =
el número de pedido/movimiento en sí. Si el criterio real es otro (prioridad,
tipo de pedido, etc.), el ORDER BY de asignar_siguiente es el único lugar que
hay que tocar — el esquema no cambia.

CONCURRENCIA (pedido explícito de Pablo: nunca asignar el mismo pedido a 2
operarios, van a ser muchos usando el widget a la vez): el reclamo es un
único UPDATE atómico con "SELECT ... FOR UPDATE SKIP LOCKED" (ver
asignar_siguiente) — 2 operarios apretando "Asignar" al mismo tiempo, incluso
en la misma fracción de segundo, siempre terminan con filas distintas. No
hace falta lockear la tabla entera ni coordinar nada del lado de la app.
"""
from datetime import date, datetime, timedelta

from db import get_connection
from db_pg import get_pg_connection
from deposito import OT_COL_PEDIDO
from errores_mesa import fetch_operario_nombre, _col_observaciones_ot, BASE_DATE

# Ventana de seguridad: no barrer OTs Cumplidas de hace demasiado tiempo (un
# pedido Cumplido en WMS pero que sigue "Abierto" en Magnus por mucho tiempo
# es raro — normalmente se cierra enseguida después del control). Ajustable
# sin tocar el resto de la lógica.
CONTROL_ASIGNACION_VENTANA_DIAS = 60


# ── WMS: pedidos con OT de Picking Cumplida (la más reciente por pedido) ─────
SQL_WMS_CUMPLIDOS_BASE = """
SELECT
    OT.{col_pedido}            AS NroPedido,
    OT.OTId                    AS Ot,
    OT.OTFechaHoraEjecucion    AS Cumplido,
    P_Repositor.PersonalId     AS NroArmador,
    P_Repositor.PersonalNombre AS NombreArmador{observ_select}
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
LEFT JOIN Personal P_Repositor ON OT.OTUsuarioGUID_Repositor = P_Repositor.PersonalId
WHERE Codot.CodotProcesoNegocio = 4          -- Picking
  AND OT.OTEstado = 2                        -- Cumplido
  AND OT.OTFechaHoraEjecucion >= ?
"""

# ── Magnus: de esos pedidos, cuáles siguen Abiertos (+ fecha/tipo/cliente) ───
SQL_MAGNUS_ABIERTOS = """
SELECT
    cab.NroMovVenta,
    cab.FechaPedido,
    cc.DetalleCorto     AS TipoPedido,
    cli.Cliente_Nombre  AS Cliente
FROM EVERWEAR.dbo.VenFer_PedidoCabecera cab
LEFT JOIN MAGNUS_SITD.dbo.Ven_CodComprobante cc  ON cab.CompCodigo   = cc.CompCodigo
LEFT JOIN MAGNUS_SITD.dbo.Pedido_Estados     est ON cab.EstadoPedido = est.Ped_Estado
LEFT JOIN MAGNUS_SITD.dbo.Clientes           cli ON cab.CodCliente   = cli.CodCliente
WHERE cab.NroMovVenta IN ({ph})
  AND est.Ped_EstadoDescripcion = 'Abierto'
"""


def fetch_pedidos_cumplidos_abiertos(limit: int = 500) -> list[dict]:
    """Cruce Cumplido(WMS) ∩ Abierto(Magnus) por NroMovVenta. Cada dict trae
    nroPedido/fecha/tipoPedido/cliente/ubicacion/ot/nroArmador/nombreArmador
    — mismos campos que usa deposito.control_asignacion. `limit` acota
    cuántos pedidos Cumplidos de WMS se consideran (los primeros por
    OTFechaHoraEjecucion DESC, o sea los cumplidos más recientemente) para no
    barrer un universo enorme en cada refresco de la cola."""
    hoy = date.today()
    # datetime (no date) para comparar contra OTFechaHoraEjecucion (WMS,
    # datetime nativo) — mismo criterio defensivo que _mov_abiertos_del_dia
    # en deposito.py.
    corte = datetime(hoy.year, hoy.month, hoy.day) - timedelta(days=CONTROL_ASIGNACION_VENTANA_DIAS)

    conn = get_connection("WMS")
    wms: dict[int, dict] = {}
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        observ_col = _col_observaciones_ot(conn)
        observ_select = f", OT.{observ_col} AS Ubicacion" if observ_col else ""
        cur.execute(
            SQL_WMS_CUMPLIDOS_BASE.format(col_pedido=OT_COL_PEDIDO, observ_select=observ_select),
            (corte,),
        )
        cols = [c[0] for c in cur.description]
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            nro = d.get("NroPedido")
            if nro is None:
                continue
            n = int(nro)
            cumplido = d.get("Cumplido")
            prev = wms.get(n)
            # Si un pedido tuviera >1 OT Cumplida, quedarse con la más reciente.
            if prev is None or (cumplido and prev.get("Cumplido") and cumplido > prev["Cumplido"]):
                ubic = d.get("Ubicacion")
                wms[n] = {
                    "nroPedido": n,
                    "ot": int(d["Ot"]) if d.get("Ot") is not None else None,
                    "nroArmador": int(d["NroArmador"]) if d.get("NroArmador") is not None else None,
                    "nombreArmador": (d.get("NombreArmador") or "").strip() or None,
                    "ubicacion": (str(ubic).strip() or None) if ubic is not None else None,
                    "Cumplido": cumplido,
                }
    finally:
        conn.close()

    if not wms:
        return []

    # Solo los más recientemente Cumplidos (evita cruzar un universo enorme
    # contra Magnus cuando la cola de "Cumplidos" acumula muchos pedidos).
    # datetime.min (no date.min) en el fallback: "Cumplido" es datetime nativo
    # de WMS, mezclar date/datetime en el sort de-facto rompería la comparación.
    pendientes = sorted(wms.values(), key=lambda d: d["Cumplido"] or datetime.min, reverse=True)[:limit]

    conn = get_connection("EVERWEAR")
    out: list[dict] = []
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        nros = [d["nroPedido"] for d in pendientes]
        CH = 1000
        abiertos: dict[int, dict] = {}
        for i in range(0, len(nros), CH):
            chunk = nros[i:i + CH]
            ph = ",".join("?" for _ in chunk)
            cur.execute(SQL_MAGNUS_ABIERTOS.format(ph=ph), chunk)
            for nro, fecha_int, tipo_pedido, cliente in cur.fetchall():
                if nro is None:
                    continue
                fecha = (BASE_DATE + timedelta(days=int(fecha_int))).date() if fecha_int else None
                abiertos[int(nro)] = {
                    "fecha": fecha,
                    "tipoPedido": (tipo_pedido or "").strip() or None,
                    "cliente": (cliente or "").strip() or None,
                }
        for d in pendientes:
            ab = abiertos.get(d["nroPedido"])
            if ab is None:
                continue  # Cumplido en WMS pero ya no está Abierto en Magnus
            out.append({
                "nroPedido": d["nroPedido"],
                "fecha": ab["fecha"],
                "tipoPedido": ab["tipoPedido"],
                "cliente": ab["cliente"],
                "ubicacion": d["ubicacion"],
                "ot": d["ot"],
                "nroArmador": d["nroArmador"],
                "nombreArmador": d["nombreArmador"],
            })
    finally:
        conn.close()

    return out


def refrescar_cola(limit: int = 500) -> int:
    """Agrega a deposito.control_asignacion los pedidos Cumplidos+Abiertos que
    todavía no estén en la cola (ON CONFLICT DO NOTHING — no toca los que ya
    están, asignados o no). Devuelve cuántos se agregaron. Se llama al
    reclamar (asignar_siguiente), no hace falta un loop/cron aparte."""
    candidatos = fetch_pedidos_cumplidos_abiertos(limit)
    if not candidatos:
        return 0
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        nuevos = 0
        for c in candidatos:
            cur.execute(
                """
                INSERT INTO deposito.control_asignacion
                    ("nroPedido", fecha, "tipoPedido", cliente, ubicacion, ot,
                     "nroArmador", "nombreArmador")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ("nroPedido") DO NOTHING
                """,
                (
                    c["nroPedido"], c["fecha"], c["tipoPedido"], c["cliente"],
                    c["ubicacion"], c["ot"], c["nroArmador"], c["nombreArmador"],
                ),
            )
            nuevos += cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return nuevos


def asignar_siguiente(nro_operario: int) -> dict:
    """Reclama, de forma atómica, el próximo pedido libre de la cola para
    `nro_operario` (resuelto a nombre igual que insert_error_mesa — no confía
    en lo que mande el cliente). Refresca la cola primero (agrega pedidos
    nuevos Cumplidos+Abiertos). Orden: "nroPedido" ascendente, empate por
    fecha descendente (ver ASUNCIÓN de "orden" en el docstring del módulo).

    Concurrencia: el UPDATE con "SELECT ... FOR UPDATE SKIP LOCKED" hace que,
    si 2 operarios llaman a esto al mismo tiempo, cada uno se lleve una fila
    distinta (o uno de los dos se quede sin pedidos si la cola tiene 1 solo) —
    nunca el mismo pedido 2 veces.

    Lanza ValueError si el operario no existe o si no hay pedidos disponibles
    (cola vacía o todos ya asignados)."""
    nombre = fetch_operario_nombre(nro_operario)
    if not nombre:
        raise ValueError(f"Operario {nro_operario} no encontrado")

    refrescar_cola()

    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE deposito.control_asignacion
            SET "asignadoA" = %s, "nroOperarioAsignado" = %s, "asignadoEn" = now()
            WHERE id = (
                SELECT id FROM deposito.control_asignacion
                WHERE "asignadoEn" IS NULL
                ORDER BY "nroPedido" ASC, fecha DESC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id, "nroPedido", fecha, "tipoPedido", cliente, ubicacion,
                      ot, "nroArmador", "nombreArmador", "asignadoA", "asignadoEn"
            """,
            (nombre, nro_operario),
        )
        row = cur.fetchone()
        conn.commit()
    finally:
        conn.close()

    if not row:
        raise ValueError("No hay pedidos disponibles para asignar")

    cols = [
        "id", "nroPedido", "fecha", "tipoPedido", "cliente", "ubicacion", "ot",
        "nroArmador", "nombreArmador", "asignadoA", "asignadoEn",
    ]
    out = dict(zip(cols, row))
    if out.get("fecha") is not None:
        out["fecha"] = out["fecha"].isoformat()
    if out.get("asignadoEn") is not None:
        out["asignadoEn"] = out["asignadoEn"].isoformat()
    return out


def fetch_cola_diag(limit: int = 20) -> dict:
    """Diagnóstico: cuántos pedidos libres/asignados hay en la cola ahora
    mismo + una muestra, para confirmar que el cruce WMS/Magnus está trayendo
    datos antes de que un operario se quede "Sin pedidos para asignar"."""
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            'SELECT COUNT(*) FILTER (WHERE "asignadoEn" IS NULL), '
            '       COUNT(*) FILTER (WHERE "asignadoEn" IS NOT NULL) '
            "FROM deposito.control_asignacion"
        )
        libres, asignados = cur.fetchone()
        cur.execute(
            'SELECT "nroPedido", fecha, cliente, ubicacion, "asignadoA", "asignadoEn" '
            'FROM deposito.control_asignacion '
            'ORDER BY "createdAt" DESC LIMIT %s',
            (limit,),
        )
        cols = [c[0] for c in cur.description]
        muestra = [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        conn.close()
    for m in muestra:
        if m.get("fecha") is not None:
            m["fecha"] = m["fecha"].isoformat()
        if m.get("asignadoEn") is not None:
            m["asignadoEn"] = m["asignadoEn"].isoformat()
    return {"libres": libres, "asignados": asignados, "muestra": muestra}
