"""
Cola de asignación de pedidos — widget de Mesa de Control (a pedido de Pablo,
2026-07-29). Reemplaza el input manual de "Nro Pedido" del widget por un
botón "Asignar": en vez de tipear el pedido a mano, el operario reclama el
próximo pedido de una cola armada con el cruce:

    Abierto en Magnus (EVERWEAR.dbo.TMP_TiempoDePedidos.Estado = 'Abierto',
    cruzado por NroMovVenta contra VenFer_PedidoCabecera solo para traer
    FechaPedido/TipoPedido/Cliente — ver FIX 2026-07-31 más abajo)
        ∩
    Cumplido en WMS (OT de Picking, OTEstado=2)

cruzados por NroMovVenta ("número de movimiento", mismo campo que ya usa
fetch_pedido_lookup en errores_mesa.py vía OT.{OT_COL_PEDIDO}).

FIX 2026-07-29 (mismo día, tras deploy): el cruce arrancaba por WMS — traía
los últimos `limit` (500) OT Cumplidas por fecha, acotadas además a los
últimos 60 días (CONTROL_ASIGNACION_VENTANA_DIAS), y recién ahí filtraba
contra Magnus. Un pedido Abierto en Magnus cuyo picking se cumplió hace más
de 60 días (o que no entraba en el top-500 más reciente) quedaba afuera sin
que hubiera ningún error — resultado: "No hay pedidos disponibles para
asignar" con pedidos que sí correspondían. Se invirtió el orden: ahora se
arranca por TODOS los Abiertos de Magnus (universo naturalmente acotado —
son los pedidos activos, no el historial de OTs) y se filtra ese conjunto
contra WMS por NroMovVenta puntual, sin ventana de fecha ni límite de
"últimos N". La intersección resultante es la misma; solo cambió qué lado
maneja el volumen.

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
from datetime import datetime, timedelta

from db import get_connection
from db_pg import get_pg_connection
from deposito import OT_COL_PEDIDO
from errores_mesa import fetch_operario_nombre, _col_observaciones_ot, BASE_DATE

# Tope de seguridad: cuántos pedidos Abiertos de Magnus se consideran como
# máximo en un solo refresco de la cola (ordenados NroMovVenta ASC, o sea los
# más viejos primero — mismo criterio que el ORDER BY de asignar_siguiente,
# así que un recorte acá nunca deja afuera al que le tocaría el turno).
# Ajustable sin tocar el resto de la lógica.
MAGNUS_ABIERTOS_LIMIT = 3000


# ── Magnus: TODOS los pedidos Abiertos (fecha/tipo/cliente) — universo base ──
# FIX 2026-07-31 (a pedido de Pablo, tras diagnóstico en vivo): la versión
# original filtraba "Abierto" vía VenFer_PedidoCabecera.EstadoPedido -> JOIN
# Pedido_Estados.Ped_EstadoDescripcion. Esa fuente ya se había detectado rota
# el 2026-07-23 en deposito.py (fetch_pedidos_hora / "Abiertos ahora": ver
# comentario ahí, "subcontaba"/quedaba plana) y se reemplazó en TODO el resto
# del proyecto por EVERWEAR.dbo.TMP_TiempoDePedidos.Estado = 'Abierto' (la
# misma tabla que llena SP_TiempoPedidos_Cargar y que ya usa la pestaña
# "Tiempo de Pedidos" + fetch_abiertos_ahora). Este módulo, escrito 6 días
# después, reintrodujo el patrón viejo sin saberlo — en vivo daba
# TOTAL ABIERTOS: 0 (el join contra Pedido_Estados no matcheaba ninguna fila),
# así que la cola de asignación nunca tenía candidatos. Se corrige acá al
# mismo criterio ya probado (TMP_TiempoDePedidos), manteniendo
# FechaPedido/TipoPedido/Cliente desde Cabecera para no tocar el resto del
# módulo.
SQL_MAGNUS_ABIERTOS_TODOS = """
SELECT TOP ({limit})
    cab.NroMovVenta,
    cab.FechaPedido,
    cc.DetalleCorto     AS TipoPedido,
    cli.Cliente_Nombre  AS Cliente
FROM EVERWEAR.dbo.VenFer_PedidoCabecera cab
INNER JOIN EVERWEAR.dbo.TMP_TiempoDePedidos   t   ON t.NroMovVenta   = cab.NroMovVenta
LEFT JOIN MAGNUS_SITD.dbo.Ven_CodComprobante cc  ON cab.CompCodigo   = cc.CompCodigo
LEFT JOIN MAGNUS_SITD.dbo.Clientes           cli ON cab.CodCliente   = cli.CodCliente
WHERE LTRIM(RTRIM(t.Estado)) = 'Abierto'
ORDER BY cab.NroMovVenta ASC
"""

# ── WMS: de esos pedidos puntuales, cuáles tienen OT de Picking Cumplida ─────
SQL_WMS_CUMPLIDOS_POR_PEDIDO = """
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
  AND OT.{col_pedido} IN ({ph})
"""


def fetch_pedidos_cumplidos_abiertos(limit: int = MAGNUS_ABIERTOS_LIMIT) -> list[dict]:
    """Cruce Abierto(Magnus) ∩ Cumplido(WMS) por NroMovVenta. Cada dict trae
    nroPedido/fecha/tipoPedido/cliente/ubicacion/ot/nroArmador/nombreArmador
    — mismos campos que usa deposito.control_asignacion.

    Arranca por Magnus (TODOS los Abiertos, hasta `limit`, NroMovVenta ASC) y
    recién ahí consulta WMS puntualmente por esos NroMovVenta — sin ventana
    de fecha. Antes era al revés (WMS primero, acotado a los últimos 500
    Cumplidos de los últimos 60 días) y dejaba afuera Abiertos con picking
    cumplido hace rato; ver nota "FIX 2026-07-29" en el docstring del módulo."""
    conn = get_connection("EVERWEAR")
    abiertos: dict[int, dict] = {}
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_MAGNUS_ABIERTOS_TODOS.format(limit=limit))
        for nro, fecha_int, tipo_pedido, cliente in cur.fetchall():
            if nro is None:
                continue
            # BASE_DATE ya es un datetime.date (ver errores_mesa.py) — sumarle
            # un timedelta da otro date, no hace falta (ni se puede) llamar
            # .date() de nuevo. FIX 2026-07-31: este bug estaba latente desde
            # el 2026-07-29 (nunca se disparaba porque el filtro de Abierto
            # de más arriba siempre devolvía 0 filas antes del fix de hoy).
            fecha = (BASE_DATE + timedelta(days=int(fecha_int))) if fecha_int else None
            abiertos[int(nro)] = {
                "fecha": fecha,
                "tipoPedido": (tipo_pedido or "").strip() or None,
                "cliente": (cliente or "").strip() or None,
            }
    finally:
        conn.close()

    if not abiertos:
        return []

    conn = get_connection("WMS")
    wms: dict[int, dict] = {}
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        observ_col = _col_observaciones_ot(conn)
        observ_select = f", OT.{observ_col} AS Ubicacion" if observ_col else ""
        nros = list(abiertos.keys())
        CH = 1000
        for i in range(0, len(nros), CH):
            chunk = nros[i:i + CH]
            ph = ",".join("?" for _ in chunk)
            cur.execute(
                SQL_WMS_CUMPLIDOS_POR_PEDIDO.format(
                    col_pedido=OT_COL_PEDIDO, observ_select=observ_select, ph=ph,
                ),
                chunk,
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
                        "ot": int(d["Ot"]) if d.get("Ot") is not None else None,
                        "nroArmador": int(d["NroArmador"]) if d.get("NroArmador") is not None else None,
                        "nombreArmador": (d.get("NombreArmador") or "").strip() or None,
                        "ubicacion": (str(ubic).strip() or None) if ubic is not None else None,
                        "Cumplido": cumplido,
                    }
    finally:
        conn.close()

    out: list[dict] = []
    for nro, ab in abiertos.items():
        w = wms.get(nro)
        if w is None:
            continue  # Abierto en Magnus pero todavía no Cumplido en WMS
        out.append({
            "nroPedido": nro,
            "fecha": ab["fecha"],
            "tipoPedido": ab["tipoPedido"],
            "cliente": ab["cliente"],
            "ubicacion": w["ubicacion"],
            "ot": w["ot"],
            "nroArmador": w["nroArmador"],
            "nombreArmador": w["nombreArmador"],
        })
    return out


def refrescar_cola(limit: int = MAGNUS_ABIERTOS_LIMIT) -> int:
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
