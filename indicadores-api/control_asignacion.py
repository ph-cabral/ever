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

ORDEN de la cola (cambiado 2026-08-03, a pedido de Pablo): "prioridad"
ascendente y, dentro de cada prioridad, fecha ascendente (más viejo primero)
— la idea es vaciar todos los atrasados de prioridad 1 hasta ponerse al día
y recién ahí pasar a prioridad 2, también de más viejo a más nuevo.
"prioridad" = `VenFer_PedidoCabecera.Prioridad` (Magnus; mismo campo que ya
usa `main.py` para el reporte "Por prioridad"), 1 = más urgente. Pedidos sin
prioridad cargada (NULL) se tratan como la prioridad más baja (van al final)
para no colarse adelante de los que sí tienen prioridad asignada — ver
COALESCE en SQL_MAGNUS_ABIERTOS_TODOS.
ANTES (hasta 2026-08-03) ordenaba por "nroPedido" ascendente, empate por
fecha descendente — se dejó de usar por pedido explícito de contaduría/mesa
de control.

CONCURRENCIA (pedido explícito de Pablo: nunca asignar el mismo pedido a 2
operarios, van a ser muchos usando el widget a la vez): el reclamo es un
único UPDATE atómico con "SELECT ... FOR UPDATE SKIP LOCKED" (ver
asignar_siguiente) — 2 operarios apretando "Asignar" al mismo tiempo, incluso
en la misma fracción de segundo, siempre terminan con filas distintas. No
hace falta lockear la tabla entera ni coordinar nada del lado de la app.

UN PEDIDO POR OPERARIO A LA VEZ (a pedido de Pablo, 2026-07-31): si vuelven a
apretar "Asignar" mientras su pedido anterior TODAVÍA no cerró en Magnus, NO
se les entrega uno nuevo — se les devuelve el mismo de siempre (mismo
nroPedido, misma fila). Solo cuando ese pedido está Cerrado (FechaCierre > 0
en VenFer_PedidoCabecera, ver _fetch_pedido_cerrado) el próximo click sí
reclama uno nuevo de la cola. Ver _fetch_asignacion_activa +
_fetch_pedido_cerrado, usados al principio de asignar_siguiente.

CODCLIENTE (a pedido de Pablo, mismo día): el cuadro grande del widget ahora
también muestra el número de cliente, no solo el nombre — se suma
`CodCliente` (VenFer_PedidoCabecera, mismo campo del JOIN contra
MAGNUS_SITD.dbo.Clientes que ya se usaba para el nombre) en todo el camino:
SQL_MAGNUS_ABIERTOS_TODOS -> fetch_pedidos_cumplidos_abiertos -> refrescar_cola
-> columna "codCliente" en deposito.control_asignacion (ALTER idempotente en
ever/sql/deposito_control_asignacion.sql, correr antes de deployar) ->
_fetch_asignacion_activa / asignar_siguiente. Sin verificar en vivo.
"""
from datetime import datetime, timedelta

from db import get_connection
from db_pg import get_pg_connection
from deposito import OT_COL_PEDIDO
from errores_mesa import fetch_operario_nombre, _col_observaciones_ot, BASE_DATE

# Tope de seguridad: cuántos pedidos Abiertos de Magnus se consideran como
# máximo en un solo refresco de la cola (ordenados Prioridad ASC, fecha ASC —
# mismo criterio que el ORDER BY de asignar_siguiente, así que un recorte
# acá nunca deja afuera al que le tocaría el turno).
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
    cli.Cliente_Nombre  AS Cliente,
    cab.CodCliente      AS CodCliente,
    cab.Prioridad       AS Prioridad
FROM EVERWEAR.dbo.VenFer_PedidoCabecera cab
INNER JOIN EVERWEAR.dbo.TMP_TiempoDePedidos   t   ON t.NroMovVenta   = cab.NroMovVenta
LEFT JOIN MAGNUS_SITD.dbo.Ven_CodComprobante cc  ON cab.CompCodigo   = cc.CompCodigo
LEFT JOIN MAGNUS_SITD.dbo.Clientes           cli ON cab.CodCliente   = cli.CodCliente
WHERE LTRIM(RTRIM(t.Estado)) = 'Abierto'
  AND cab.CompCodigo <> 70  -- excluye acopios (a pedido de Pablo, 2026-08-03;
  -- ajustado el mismo día: el 75 SÍ debe quedar, solo se excluye el 70,
  -- hasta encontrar una forma mejor de distinguir acopios)
ORDER BY COALESCE(cab.Prioridad, 999) ASC, cab.FechaPedido ASC
-- 2026-08-03 (a pedido de Pablo): prioridad ASC (1 = más urgente) y, dentro
-- de cada prioridad, fecha ASC (más viejo primero) — vaciar los atrasados de
-- prioridad 1 hasta ponerse al día antes de pasar a prioridad 2. Antes era
-- NroMovVenta ASC. Sin Prioridad cargada -> 999, al final de la cola.
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

    Arranca por Magnus (TODOS los Abiertos, hasta `limit`, prioridad ASC/
    fecha ASC) y recién ahí consulta WMS puntualmente por esos NroMovVenta — sin ventana
    de fecha. Antes era al revés (WMS primero, acotado a los últimos 500
    Cumplidos de los últimos 60 días) y dejaba afuera Abiertos con picking
    cumplido hace rato; ver nota "FIX 2026-07-29" en el docstring del módulo."""
    conn = get_connection("EVERWEAR")
    abiertos: dict[int, dict] = {}
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_MAGNUS_ABIERTOS_TODOS.format(limit=limit))
        for nro, fecha_int, tipo_pedido, cliente, cod_cliente, prioridad in cur.fetchall():
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
                # Número de cliente (Magnus CodCliente) — a pedido de Pablo
                # 2026-07-31, el widget lo muestra junto al nombre.
                "codCliente": int(cod_cliente) if cod_cliente is not None else None,
                # Orden de la cola (a pedido de Pablo, 2026-08-03) — ver
                # SQL_MAGNUS_ABIERTOS_TODOS. None = sin prioridad cargada.
                "prioridad": int(prioridad) if prioridad is not None else None,
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
            "codCliente": ab["codCliente"],
            "prioridad": ab["prioridad"],
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
                    ("nroPedido", fecha, "tipoPedido", cliente, "codCliente", "prioridad",
                     ubicacion, ot, "nroArmador", "nombreArmador")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ("nroPedido") DO NOTHING
                """,
                (
                    c["nroPedido"], c["fecha"], c["tipoPedido"], c["cliente"], c["codCliente"],
                    c["prioridad"], c["ubicacion"], c["ot"], c["nroArmador"], c["nombreArmador"],
                ),
            )
            nuevos += cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return nuevos


def _fetch_pedido_cerrado(nro_pedido: int) -> bool:
    """True si `nro_pedido` ya está Cerrado en Magnus. Mismo criterio que
    fetch_pedidos_hora (deposito.py): VenFer_PedidoCabecera.FechaCierre es la
    fecha nativa de Magnus (días desde 1800-12-28); <= 0 o NULL = todavía no
    cerró. Se usa Cabecera (no TMP_TiempoDePedidos) para este chequeo puntual
    porque es en vivo — TMP_TiempoDePedidos es una foto que llena
    SP_TiempoPedidos_Cargar y podría tardar en reflejar el cierre.

    Si el pedido no aparece en Cabecera (caso raro / archivado), se considera
    Cerrado para no dejar al operario trabado esperando un pedido que ya no
    existe."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT FechaCierre FROM EVERWEAR.dbo.VenFer_PedidoCabecera WHERE NroMovVenta = ?",
            (nro_pedido,),
        )
        row = cur.fetchone()
    finally:
        conn.close()
    if row is None:
        return True
    fecha_cierre = row[0]
    try:
        return fecha_cierre is not None and int(fecha_cierre) > 0
    except (TypeError, ValueError):
        return False


def _fetch_asignacion_activa(nro_operario: int) -> dict | None:
    """Última fila que este operario reclamó (deposito.control_asignacion,
    la más reciente por "asignadoEn"). None si nunca reclamó nada. Se usa
    para no entregarle un pedido nuevo mientras el anterior sigue abierto —
    ver nota "UN PEDIDO POR OPERARIO A LA VEZ" en el docstring del módulo."""
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, "nroPedido", fecha, "tipoPedido", cliente, "codCliente", "prioridad",
                   ubicacion, ot, "nroArmador", "nombreArmador", "asignadoA", "asignadoEn"
            FROM deposito.control_asignacion
            WHERE "nroOperarioAsignado" = %s AND "asignadoEn" IS NOT NULL
            ORDER BY "asignadoEn" DESC
            LIMIT 1
            """,
            (nro_operario,),
        )
        row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    cols = [
        "id", "nroPedido", "fecha", "tipoPedido", "cliente", "codCliente", "prioridad",
        "ubicacion", "ot", "nroArmador", "nombreArmador", "asignadoA", "asignadoEn",
    ]
    out = dict(zip(cols, row))
    if out.get("fecha") is not None:
        out["fecha"] = out["fecha"].isoformat()
    if out.get("asignadoEn") is not None:
        out["asignadoEn"] = out["asignadoEn"].isoformat()
    return out


def asignar_siguiente(nro_operario: int) -> dict:
    """Reclama, de forma atómica, el próximo pedido libre de la cola para
    `nro_operario` (resuelto a nombre igual que insert_error_mesa — no confía
    en lo que mande el cliente). Refresca la cola primero (agrega pedidos
    nuevos Cumplidos+Abiertos). Orden (2026-08-03): "prioridad" ascendente
    (1 = más urgente, NULL al final) y, dentro de cada prioridad, fecha
    ascendente — vacía los atrasados de cada prioridad antes de pasar a la
    siguiente (ver nota de ORDEN en el docstring del módulo).

    UN PEDIDO POR OPERARIO A LA VEZ (2026-07-31): antes de tocar la cola, se
    fija si `nro_operario` ya tiene una asignación activa cuyo pedido sigue
    Abierto en Magnus — si es así, se le devuelve ESA MISMA fila (no cuenta
    como un reclamo nuevo). Solo si no tiene ninguna o la que tiene ya Cerró
    se sigue con el flujo normal de reclamar la próxima libre.

    Concurrencia: el UPDATE con "SELECT ... FOR UPDATE SKIP LOCKED" hace que,
    si 2 operarios llaman a esto al mismo tiempo, cada uno se lleve una fila
    distinta (o uno de los dos se quede sin pedidos si la cola tiene 1 solo) —
    nunca el mismo pedido 2 veces.

    Lanza ValueError si el operario no existe o si no hay pedidos disponibles
    (cola vacía o todos ya asignados)."""
    nombre = fetch_operario_nombre(nro_operario)
    if not nombre:
        raise ValueError(f"Operario {nro_operario} no encontrado")

    activa = _fetch_asignacion_activa(nro_operario)
    if activa is not None and not _fetch_pedido_cerrado(activa["nroPedido"]):
        return activa

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
                ORDER BY COALESCE("prioridad", 999) ASC, fecha ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id, "nroPedido", fecha, "tipoPedido", cliente, "codCliente", "prioridad",
                      ubicacion, ot, "nroArmador", "nombreArmador", "asignadoA", "asignadoEn"
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
        "id", "nroPedido", "fecha", "tipoPedido", "cliente", "codCliente", "prioridad",
        "ubicacion", "ot", "nroArmador", "nombreArmador", "asignadoA", "asignadoEn",
    ]
    out = dict(zip(cols, row))
    if out.get("fecha") is not None:
        out["fecha"] = out["fecha"].isoformat()
    if out.get("asignadoEn") is not None:
        out["asignadoEn"] = out["asignadoEn"].isoformat()
    return out


# ── Historial: "Pedidos asignados" (vista /deposito/deposito → Mesas) ────────
# A pedido de Pablo (2026-07-31, mismo día que se armó la cola): el "próximo
# paso" anotado en deposito_control_asignacion.sql ("listar qué se le asignó
# a X controlador") — vista de detalle, 1 fila por pedido YA reclamado
# ("asignadoEn" IS NOT NULL), para ver qué hizo cada operario.
#
# "Fecha"/"Hora" salen de "asignadoEn" (el momento real en que ESE operario
# reclamó el pedido), no de `fecha` (FechaPedido de Magnus, que puede ser
# muy anterior si el pedido esperó en la cola) — así son comparables contra
# "horaCierre" (mismo reloj).
#
# "horaCierre": no hay un cierre explícito por pedido (el widget no tiene un
# botón "Terminé"), así que se aproxima con la PRÓXIMA vez que ESE MISMO
# operario reclamó otro pedido (LEAD("asignadoEn") particionado por
# "nroOperarioAsignado", ordenado por "asignadoEn"). Es un proxy: si el
# operario todavía no reclamó uno nuevo (última fila de su partición),
# "horaCierre" viene NULL — se interpreta como "en curso" en la vista, no
# como dato faltante. Ver "UN PEDIDO POR OPERARIO A LA VEZ" arriba: mientras
# el pedido activo no cierra en Magnus, un reclamo repetido devuelve LA MISMA
# fila (no pisa "asignadoEn"), así que esta cuenta no se contamina con
# reclamos repetidos del mismo pedido.
#
# "cantidadItems": no vive en Postgres — se resuelve en un segundo paso contra
# Magnus (dbo.venfer_pedidoReng, mismo origen que mesa_control.py), COUNT(*)
# por NroMovVenta, en lote (IN) para toda la lista de pedidos del resultado.
def fetch_pedidos_asignados(desde: str | None = None, hasta: str | None = None) -> dict:
    """Historial de pedidos asignados (deposito.control_asignacion), con
    cantidad de ítems (Magnus) y "horaCierre" (próxima asignación del mismo
    operario). `desde`/`hasta` = 'YYYY-MM-DD', filtran por la FECHA de
    "asignadoEn". Sin ninguno de los dos: HOY. Excluye acopios (CompCodigo 70
    en vivo contra Magnus; el 75 queda incluido) — ver comentario junto al
    filtro más abajo. Solo lectura."""
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        params: list = []
        if desde and hasta:
            cond = '"asignadoEn"::date BETWEEN %s AND %s'
            params = [desde, hasta]
        elif desde:
            cond = '"asignadoEn"::date >= %s'
            params = [desde]
        elif hasta:
            cond = '"asignadoEn"::date <= %s'
            params = [hasta]
        else:
            cond = '"asignadoEn"::date = CURRENT_DATE'
        cur.execute(
            f"""
            SELECT "nroPedido", "codCliente", cliente,
                   "nroOperarioAsignado", "asignadoA", "asignadoEn",
                   LEAD("asignadoEn") OVER (
                       PARTITION BY "nroOperarioAsignado" ORDER BY "asignadoEn"
                   ) AS "horaCierre"
            FROM deposito.control_asignacion
            WHERE "asignadoEn" IS NOT NULL AND {cond}
            ORDER BY "asignadoEn" DESC
            """,
            params,
        )
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        conn.close()

    for r in rows:
        if r.get("asignadoEn") is not None:
            r["asignadoEn"] = r["asignadoEn"].isoformat()
        if r.get("horaCierre") is not None:
            r["horaCierre"] = r["horaCierre"].isoformat()

    # Excluye acopios (a pedido de Pablo, 2026-08-03: CompCodigo 70 — el 75
    # NO se excluye, queda incluido a pedido explícito — mismo criterio que
    # SQL_MAGNUS_ABIERTOS_TODOS). Esa exclusión en la cola solo
    # frena pedidos NUEVOS al refrescar — pedidos que ya habían quedado
    # guardados en deposito.control_asignacion (de antes del fix, o insertados
    # por otra vía) seguían apareciendo acá porque este historial no
    # filtraba nada, solo leía la tabla. Se filtra en vivo contra
    # VenFer_PedidoCabecera.CompCodigo ANTES de calcular cantidadItems, así
    # ni "Desglose por operario" ni "Detalle por pedido" (ambos salen de
    # `rows`) lo cuentan — ej. pedido 748595 (CompCodigo 70, Flores Marcos).
    nros = sorted({r["nroPedido"] for r in rows if r.get("nroPedido") is not None})
    comp_codigo: dict[int, int | None] = {}
    items_por_pedido: dict[int, int] = {}
    if nros:
        conn = get_connection("EVERWEAR")
        try:
            cur = conn.cursor()
            cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
            CH = 1000
            for i in range(0, len(nros), CH):
                chunk = nros[i : i + CH]
                ph = ",".join("?" for _ in chunk)
                cur.execute(
                    f"SELECT NroMovVenta, CompCodigo FROM dbo.VenFer_PedidoCabecera "
                    f"WHERE NroMovVenta IN ({ph})",
                    chunk,
                )
                for nro, comp in cur.fetchall():
                    comp_codigo[int(nro)] = int(comp) if comp is not None else None

            rows = [r for r in rows if comp_codigo.get(r["nroPedido"]) != 70]
            nros = sorted({r["nroPedido"] for r in rows if r.get("nroPedido") is not None})

            for i in range(0, len(nros), CH):
                chunk = nros[i : i + CH]
                ph = ",".join("?" for _ in chunk)
                cur.execute(
                    f"SELECT NroMovVenta, COUNT(*) FROM dbo.venfer_pedidoReng "
                    f"WHERE NroMovVenta IN ({ph}) GROUP BY NroMovVenta",
                    chunk,
                )
                for nro, cnt in cur.fetchall():
                    items_por_pedido[int(nro)] = int(cnt)
        finally:
            conn.close()

    for r in rows:
        r["cantidadItems"] = items_por_pedido.get(r["nroPedido"], 0)

    return {"pedidos": rows}


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
            'SELECT "nroPedido", fecha, "prioridad", cliente, ubicacion, "asignadoA", "asignadoEn" '
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
