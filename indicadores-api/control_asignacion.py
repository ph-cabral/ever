"""
Cola de asignación de pedidos — widget de Mesa de Control (a pedido de Pablo,
2026-07-29). Reemplaza el input manual de "Nro Pedido" del widget por un
botón "Asignar": en vez de tipear el pedido a mano, el operario reclama el
próximo pedido de una cola armada con el cruce:

    Abierto en Magnus (EVERWEAR.dbo.TMP_TiempoDePedidos.Estado = 'Abierto',
    cruzado por NroMovVenta contra VenFer_PedidoCabecera solo para traer
    FechaPedido/TipoPedido/Cliente — ver FIX 2026-07-31 más abajo)
        ∩
    Cumplido en WMS: la OT de Picking MÁS RECIENTE del pedido (mayor OTId)
    está en OTEstado=2 — ver FIX 2026-08-03 más abajo (no alcanza con que
    EXISTA alguna OT vieja Cumplida)

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

FIX 2026-08-03 (a pedido de Pablo, reportado en vivo): la cola traía pedidos
que WMS todavía no marca Cumplido. Causa: `SQL_WMS_CUMPLIDOS_POR_PEDIDO`
filtraba `OTEstado = 2` directo en el SQL — si un pedido tenía una OT vieja
ya Cumplida y una MÁS NUEVA sin terminar (repick/corrección tras un error),
la vieja igual matcheaba y el pedido se daba por listo. Fix: se trae TODA OT
de Picking del pedido (`SQL_WMS_OT_POR_PEDIDO`, sin filtrar OTEstado) y en
Python se elige la de mayor OTId (más reciente, mismo criterio que usa
`deposito.py`); el pedido solo cuenta como Cumplido si ESA está en
OTEstado=2. Sin verificar en vivo — falta rebuild indicadores-api.

FIX 2026-08-05 (a pedido de Pablo, cambio de criterio): el lado WMS del
cruce deja de ser "Cumplido" (OTEstado=2) — pasa a ser "el pedido tiene al
menos 1 renglón de su OT de Picking parado en la ubicación PLAYA_PEDIDOS"
(OTItem.OTItemUbicacionCodigo, confirmado por diagnóstico en vivo contra
WMS). El lado Magnus (Abierto, SQL_MAGNUS_ABIERTOS_TODOS) no cambió — sigue
siendo el universo base y la fuente de fecha/tipo/cliente/prioridad. Ver
SQL_WMS_PLAYA_PEDIDOS / fetch_pedidos_en_playa_pedidos (nuevas) y
refrescar_cola (ahora llama a la nueva función). La query/función vieja
("Cumplido") se deja intacta, sin usar, en
SQL_WMS_OT_POR_PEDIDO_LEGACY_CUMPLIDO / fetch_pedidos_cumplidos_abiertos_legacy
— pedido explícito de Pablo de no perderla. Ojo: la columna correcta para ir
de OT a Magnus sigue siendo OT.OTNroMovVenta (constante OT_COL_PEDIDO en
deposito.py) — en el diagnóstico se probó por error OT.OTPedidoId primero,
que también existe pero es un ID compuesto interno de WMS (ej.
"MAGEW-738058-0-0-334695"), no el NroMovVenta de Magnus. Sin verificar en
vivo — falta rebuild indicadores-api.

FIX 2026-08-24 (reportado en vivo por Pablo: la cola asignó el pedido 757536
con su OT 144356 todavía "En Proceso"): PLAYA_PEDIDOS solo NO alcanza. El
armador va dejando renglones en playa MIENTRAS pickea, así que el pedido
aparecía en la cola con el picking a medio hacer. El lado WMS pasa a exigir
las dos cosas: la OT de Picking MÁS RECIENTE del pedido tiene que estar
Cumplida (OTEstado = 2) Y tener algún renglón en PLAYA_PEDIDOS. No revierte
el FIX 2026-08-05, lo suma. Detalle importante del cómo (es la trampa del FIX
2026-08-03): ninguno de los dos filtros va en el WHERE — SQL_WMS_PLAYA_PEDIDOS
trae TODAS las OT de Picking del pedido con un flag EnPlaya y la decisión se
toma en Python sobre max(OTId), para que un repick nuevo En Proceso gane
siempre sobre una OT vieja Cumplida. Solo afecta a los pedidos NO acopio; el
camino de acopio (70/75) no toca WMS. Sin verificar en vivo — falta rebuild
indicadores-api.

ACOPIO 70/75 — LA UNIDAD DE CONTROL ES LA VUELTA, NO EL PEDIDO
(2026-08-21, a pedido de Pablo; cierra el problema que venía dando vueltas
desde el FIX 2026-08-04 y el FIX 2026-08-18 de más arriba).

El bug de diseño: un acopio queda `EstadoPedido = 2` (Abierto) DURANTE MESES
—no cierra hasta que se entregó el 100% o se anuló— y este módulo libera al
operario cuando el PEDIDO cierra en Magnus (`_fetch_pedido_cerrado`). Con un
acopio asignado, ese gate no se cumplía nunca: el operario quedaba trabado y
"Asignar" le devolvía siempre el mismo pedido. Los parches anteriores
(excluir 70/75 de la cola; después dejar entrar 70 solo con Prioridad 1/3)
esquivaban el síntoma sin tocar la causa.

La causa es la unidad. Cada vuelta del acopio es 1 OT1PIC de WMS = 1 REMITO
de Magnus (`VenFer_RmtoCabecera`, `CompCodigo = 71`, `NroMovPedido` = el
pedido; son 1 a 1). Las tres fechas del remito SON el circuito:

    FechaArmado  + UsuarioArmado -> terminó de preparar (armador real)
    FechaCierre  + UsuarioCierre -> PASÓ POR MESA DE CONTROL
    FechaEnvio                   -> salió al cliente

`Gen_Usuarios` 174 = "MESA CONTROL 1", 175 = "MESA CONTROL 2", 214 =
"MESA CONTROL 3" — son PUESTOS, no personas, y aparecen SOLO en
`UsuarioCierre`. O sea: el control de acopio SIEMPRE estuvo registrado, en el
remito. En acopio la mesa NO escribe en `Ven_PedImpresoCP` (por eso
consulta_tandas_control_cod70.py daba 0 filas ahí y se concluyó, mal, que
"no hay señal de control"; en cod.10 es al revés — el remito nunca trae
FechaArmado).

Entonces:
  · La cola guarda una fila POR VUELTA para acopio (columna "nroRemito" > 0)
    y una fila POR PEDIDO para todo lo demás ("nroRemito" = 0). Unicidad
    ("nroPedido", "nroRemito") — ver ever/sql/deposito_control_asignacion.sql,
    CORRER ESE ALTER ANTES DE REBUILDEAR.
  · El lado WMS NO se usa para acopio: `FechaArmado > 0` en el remito ya es
    "terminó de preparar", que es lo mismo que buscaba el cruce contra
    PLAYA_PEDIDOS, y evita el bug de `CodotProcesoNegocio` (esa columna vive
    en `Codot`, no en `OT`).
  · El gate de liberación se elige por fila (`_fetch_asignacion_cerrada`):
    remito -> `VenFer_RmtoCabecera.FechaCierre > 0` (lo que escribe mesa);
    pedido -> `_fetch_pedido_cerrado` de siempre, sin cambios.
  · Se descarta el criterio "solo Prioridad 1/3" del FIX 2026-08-18: era un
    workaround de esto mismo. Ahora entran TODOS los acopios, por vuelta.

QUEDAN AFUERA (si no, vuelven a trabar el puesto): remitos sin renglones y
`EstadoRemito = 3` (borrador sin emitir = vuelta que fue a buscar y no había
nada) — no van a pasar por mesa nunca. Y `EstadoRemito = 4` = anulado.

FIX 2026-08-21 (aparte, latente): `SQL_MAGNUS_ABIERTOS_TODOS` no traía
`CodCliente` pero `refrescar_cola` insertaba `c["codCliente"]` — KeyError en
cada refresco. Se agrega la columna al SELECT y al dict de salida de las dos
funciones que la usan. Venía roto desde el alta de codCliente (2026-07-31).
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
  AND (
        cab.CompCodigo IN (10, 100, 210, 310)  -- ACOPIO: 70 y 75 NO entran
        -- por acá. Desde 2026-08-21 tienen su propia query, por vuelta:
        -- SQL_MAGNUS_ACOPIO_ESPERA_CONTROL. El criterio "70 solo Prioridad
        -- 1/3" del FIX 2026-08-18 queda DESCARTADO (era un workaround de que
        -- el pedido de acopio no cierra nunca) — ver docstring del módulo.
        -- FIX 2026-08-04 (a pedido
        -- de Pablo): antes era NOT IN (70) — dejaba pasar Factura Directa
        -- (107/1107/1207/170/207/47/7) a la cola del widget de errores-mesa.
        -- Whitelist explícita, solo para esta cola: Pedido Mayorista (10),
        -- Pedido Mayorista Mostradores (100), Pedido Móvil (210), Pedido Web
        -- (310). Acota mucho más que antes (ya no solo excluye acopios) —
        -- este criterio es EXCLUSIVO de esta cola, no tocar las demás
        -- queries de "Abiertos" del proyecto (deposito.py, etc.).
        -- FIX 2026-08-18 (a pedido de Pablo, dato confirmado por él): acopio
        -- (CompCodigo=70) vuelve a esta cola, pero SOLO Prioridad 1 y 3. El
        -- resto de las prioridades de acopio se entregan de a poco durante
        -- varios meses (una OT de Picking nueva por cada tanda que llega) y
        -- NO tienen ninguna señal en Magnus/WMS de "esta tanda ya se
        -- controló" — confirmado corriendo consulta_tandas_control_cod70.py
        -- contra 8 pedidos cod.70 con 4 a 10 OT de Picking cada uno a lo
        -- largo de varios meses: Ven_PedImpresoCP (Mesa de Control) da 0
        -- filas en los 8, o sea el control de Magnus no se usa para esas
        -- prioridades. Prioridad 1/3 quedan afuera de ese patrón (dato de
        -- Pablo) y sí pueden entrar a la cola con el mismo criterio
        -- Abierto+Cumplido que el resto de los tipos de pedido.
      )
ORDER BY COALESCE(cab.Prioridad, 999) ASC, cab.FechaPedido ASC
-- 2026-08-03 (a pedido de Pablo): prioridad ASC (1 = más urgente) y, dentro
-- de cada prioridad, fecha ASC (más viejo primero) — vaciar los atrasados de
-- prioridad 1 hasta ponerse al día antes de pasar a prioridad 2. Antes era
-- NroMovVenta ASC. Sin Prioridad cargada -> 999, al final de la cola.
"""
# SELECT TOP ({limit})
#     cab.NroMovVenta,
#     cab.FechaPedido,
#     cc.DetalleCorto     AS TipoPedido,
#     cli.Cliente_Nombre  AS Cliente,
#     cab.Prioridad       AS Prioridad
# FROM EVERWEAR.dbo.VenFer_PedidoCabecera cab
# INNER JOIN EVERWEAR.dbo.TMP_TiempoDePedidos   t   ON t.NroMovVenta   = cab.NroMovVenta
# LEFT JOIN MAGNUS_SITD.dbo.Ven_CodComprobante cc  ON cab.CompCodigo   = cc.CompCodigo
# LEFT JOIN MAGNUS_SITD.dbo.Clientes           cli ON cab.CodCliente   = cli.CodCliente
# WHERE LTRIM(RTRIM(t.Estado)) = 'Abierto'
#   AND (
#         cab.CompCodigo IN (10, 75, 100, 210, 310)  -- FIX 2026-08-04 (a pedido
#         -- de Pablo): antes era NOT IN (70) — dejaba pasar Factura Directa
#         -- (107/1107/1207/170/207/47/7) a la cola del widget de errores-mesa.
#         -- Whitelist explícita, solo para esta cola: Pedido Mayorista (10),
#         -- Pedido Mayorista Mostradores (100), Pedido Móvil (210), Pedido Web
#         -- (310). Acota mucho más que antes (ya no solo excluye acopios) —
#         -- este criterio es EXCLUSIVO de esta cola, no tocar las demás
#         -- queries de "Abiertos" del proyecto (deposito.py, etc.).
#         OR (cab.CompCodigo = 70 AND cab.Prioridad IN (1, 3))
#         -- FIX 2026-08-18 (a pedido de Pablo, dato confirmado por él): acopio
#         -- (CompCodigo=70) vuelve a esta cola, pero SOLO Prioridad 1 y 3. El
#         -- resto de las prioridades de acopio se entregan de a poco durante
#         -- varios meses (una OT de Picking nueva por cada tanda que llega) y
#         -- NO tienen ninguna señal en Magnus/WMS de "esta tanda ya se
#         -- controló" — confirmado corriendo consulta_tandas_control_cod70.py
#         -- contra 8 pedidos cod.70 con 4 a 10 OT de Picking cada uno a lo
#         -- largo de varios meses: Ven_PedImpresoCP (Mesa de Control) da 0
#         -- filas en los 8, o sea el control de Magnus no se usa para esas
#         -- prioridades. Prioridad 1/3 quedan afuera de ese patrón (dato de
#         -- Pablo) y sí pueden entrar a la cola con el mismo criterio
#         -- Abierto+Cumplido que el resto de los tipos de pedido.
#       )
# ORDER BY COALESCE(cab.Prioridad, 999) ASC, cab.FechaPedido ASC
# -- 2026-08-03 (a pedido de Pablo): prioridad ASC (1 = más urgente) y, dentro
# -- de cada prioridad, fecha ASC (más viejo primero) — vaciar los atrasados de
# -- prioridad 1 hasta ponerse al día antes de pasar a prioridad 2. Antes era
# -- NroMovVenta ASC. Sin Prioridad cargada -> 999, al final de la cola.

# ── WMS: de esos pedidos puntuales, TODAS sus OT de Picking (no solo las ────
# Cumplidas) — para poder quedarnos con la MÁS RECIENTE y recién ahí decidir
# si el pedido está Cumplido. FIX 2026-08-03 (a pedido de Pablo, reportado en
# vivo: la cola traía pedidos que WMS no marca Cumplido): antes esta query
# filtraba OTEstado=2 directo en SQL, así que si un pedido tenía una OT vieja
# Cumplida y una MÁS NUEVA todavía sin terminar (repick/corrección), la vieja
# igual matcheaba y el pedido entraba a la cola como si estuviera listo. Ver
# fetch_pedidos_cumplidos_abiertos: ahí se agrupa por pedido y se elige la OT
# de mayor OTId (mismo criterio "más reciente" que ya usa deposito.py,
# ORDER BY OT.OTId DESC) — el pedido solo cuenta como Cumplido si ESA es
# OTEstado=2.
#
# LEGACY (a partir de 2026-08-05, ver SQL_WMS_PLAYA_PEDIDOS más abajo): a
# pedido de Pablo, el criterio "Cumplido" se reemplazó por "está físicamente
# parado en la ubicación PLAYA_PEDIDOS" — refrescar_cola ya NO llama a
# fetch_pedidos_cumplidos_abiertos. Se deja el código acá sin tocar (no se
# borra) por si hace falta volver atrás o comparar.
SQL_WMS_OT_POR_PEDIDO_LEGACY_CUMPLIDO = """
SELECT
    OT.{col_pedido}            AS NroPedido,
    OT.OTId                    AS Ot,
    OT.OTEstado                AS OTEstado,
    OT.OTFechaHoraEjecucion    AS Cumplido,
    P_Repositor.PersonalId     AS NroArmador,
    P_Repositor.PersonalNombre AS NombreArmador{observ_select}
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
LEFT JOIN Personal P_Repositor ON OT.OTUsuarioGUID_Repositor = P_Repositor.PersonalId
WHERE Codot.CodotProcesoNegocio = 4          -- Picking
  AND OT.{col_pedido} IN ({ph})
"""


# ── WMS: pedidos con al menos 1 renglón de la OT de Picking parado en la ────
# ubicación PLAYA_PEDIDOS (a pedido de Pablo, 2026-08-05). Reemplaza el
# criterio "Cumplido" de arriba: la señal de "listo para Mesa de Control" ya
# no es el estado de la OT, es la ubicación física del pedido en WMS.
# Columna confirmada por diagnóstico en vivo: OTItem.OTItemUbicacionCodigo
# (NO OT.OTPedidoId/OT.OTObservaciones). El cruce con Magnus sigue siendo por
# {col_pedido} = OT_COL_PEDIDO = "OTNroMovVenta" (mismo campo ya confirmado y
# usado en TODO el resto del proyecto — errores_mesa.py, deposito.py — para
# ir de OT a VenFer_PedidoCabecera.NroMovVenta; OT.OTPedidoId es OTRA columna,
# con un ID compuesto tipo "MAGEW-738058-0-0-334695", no sirve para este
# cruce).
# FIX 2026-08-24 (reportado en vivo por Pablo: la cola asignó el pedido 757536
# con su OT 144356 en "En Proceso" y Fin Picking 00:00:00). Estar parado en
# PLAYA_PEDIDOS NO alcanza: el armador deja renglones en playa MIENTRAS sigue
# pickeando, así que hay renglones en playa con la OT todavía En Proceso. El
# criterio vuelve a exigir CUMPLIDA (OTEstado = 2) **además** de estar en
# playa: es un AND con el FIX 2026-08-05, no un reemplazo.
#
# Ojo con el CÓMO, que es la trampa del FIX 2026-08-03: el filtro NO va en el
# WHERE. Si acá filtráramos OTEstado = 2, un pedido con una OT vieja Cumplida
# + un repick MÁS NUEVO En Proceso volvería a colarse (la vieja sobrevive al
# filtro y pasa a ser "la más reciente"). Por eso la query trae TODAS las OT de
# Picking del pedido —con y sin renglones en playa— marcando cuáles están en
# playa (EnPlaya), y la decisión ("la más reciente tiene que estar Cumplida Y
# en playa") se toma en Python sobre max(OTId). Por lo mismo se saca el INNER
# JOIN a OTItem: filtraba las OT sin playa, y la OT nueva En Proceso ni
# siquiera aparecía para ganar el max(OTId).
SQL_WMS_PLAYA_PEDIDOS = """
SELECT
    OT.{col_pedido}            AS NroPedido,
    OT.OTId                    AS Ot,
    OT.OTEstado                AS OTEstado,
    OT.OTFechaHoraEjecucion    AS Cumplido,
    P_Repositor.PersonalId     AS NroArmador,
    P_Repositor.PersonalNombre AS NombreArmador,
    CASE WHEN EXISTS (
        SELECT 1 FROM OTItem i
        WHERE i.OTId = OT.OTId
          AND LTRIM(RTRIM(i.OTItemUbicacionCodigo)) = 'PLAYA_PEDIDOS'
    ) THEN 1 ELSE 0 END        AS EnPlaya
FROM OT
INNER JOIN Codot ON OT.CodotCodigo = Codot.CodotCodigo
LEFT JOIN Personal P_Repositor ON OT.OTUsuarioGUID_Repositor = P_Repositor.PersonalId
WHERE Codot.CodotProcesoNegocio = 4          -- Picking
  AND OT.{col_pedido} IN ({ph})
"""


def fetch_pedidos_cumplidos_abiertos_legacy(limit: int = MAGNUS_ABIERTOS_LIMIT) -> list[dict]:
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
                # FIX 2026-08-21: faltaba y refrescar_cola lo insertaba igual.
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
                SQL_WMS_OT_POR_PEDIDO_LEGACY_CUMPLIDO.format(
                    col_pedido=OT_COL_PEDIDO, observ_select=observ_select, ph=ph,
                ),
                chunk,
            )
            cols = [c[0] for c in cur.description]
            for row in cur.fetchall():
                d = dict(zip(cols, row))
                nro = d.get("NroPedido")
                ot_id = d.get("Ot")
                if nro is None or ot_id is None:
                    continue
                n = int(nro)
                prev = wms.get(n)
                # Nos quedamos con la OT de Picking de MAYOR OTId (la más
                # reciente), sea Cumplida o no — así, si el pedido tiene una
                # OT nueva todavía sin terminar, esa manda y no una vieja ya
                # Cumplida (ver nota FIX 2026-08-03 junto a la query).
                if prev is None or int(ot_id) > prev["ot"]:
                    ubic = d.get("Ubicacion")
                    wms[n] = {
                        "ot": int(ot_id),
                        "otEstado": int(d["OTEstado"]) if d.get("OTEstado") is not None else None,
                        "nroArmador": int(d["NroArmador"]) if d.get("NroArmador") is not None else None,
                        "nombreArmador": (d.get("NombreArmador") or "").strip() or None,
                        "ubicacion": (str(ubic).strip() or None) if ubic is not None else None,
                    }
    finally:
        conn.close()

    out: list[dict] = []
    for nro, ab in abiertos.items():
        w = wms.get(nro)
        if w is None or w.get("otEstado") != 2:
            # Sin OT de Picking, o la más reciente todavía no está Cumplida
            # (OTEstado=2) — no está lista para controlar.
            continue
        out.append({
            "nroPedido": nro,
            "fecha": ab["fecha"],
            "tipoPedido": ab["tipoPedido"],
            "cliente": ab["cliente"],
            "codCliente": ab["codCliente"],
            "prioridad": ab["prioridad"],
            "nroRemito": 0,          # fila "por pedido" (ver docstring: acopio va por vuelta)
            "ubicacion": w["ubicacion"],
            "ot": w["ot"],
            "nroArmador": w["nroArmador"],
            "nombreArmador": w["nombreArmador"],
        })
    return out


def fetch_pedidos_en_playa_pedidos(limit: int = MAGNUS_ABIERTOS_LIMIT) -> list[dict]:
    """Cruce Abierto(Magnus) ∩ "está en la ubicación PLAYA_PEDIDOS" (WMS,
    OTItem.OTItemUbicacionCodigo) por NroMovVenta. Reemplaza el criterio
    "Cumplido" (ver fetch_pedidos_cumplidos_abiertos_legacy) — a pedido de
    Pablo, 2026-08-05: la señal de "listo para Mesa de Control" pasa a ser
    la ubicación física del pedido en WMS, no el estado de la OT. Mismo
    armado que la función legacy (arranca por TODOS los Abiertos de Magnus y
    filtra puntual contra WMS por esos NroMovVenta, en lotes de 1000) —
    misma forma de salida (nroPedido/fecha/tipoPedido/cliente/codCliente/
    prioridad/ubicacion/ot/nroArmador/nombreArmador)."""
    conn = get_connection("EVERWEAR")
    abiertos: dict[int, dict] = {}
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_MAGNUS_ABIERTOS_TODOS.format(limit=limit))
        for nro, fecha_int, tipo_pedido, cliente, cod_cliente, prioridad in cur.fetchall():
            if nro is None:
                continue
            fecha = (BASE_DATE + timedelta(days=int(fecha_int))) if fecha_int else None
            abiertos[int(nro)] = {
                "fecha": fecha,
                "tipoPedido": (tipo_pedido or "").strip() or None,
                "cliente": (cliente or "").strip() or None,
                # FIX 2026-08-21: faltaba y refrescar_cola lo insertaba igual.
                "codCliente": int(cod_cliente) if cod_cliente is not None else None,
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
        nros = list(abiertos.keys())
        CH = 1000
        for i in range(0, len(nros), CH):
            chunk = nros[i:i + CH]
            ph = ",".join("?" for _ in chunk)
            cur.execute(
                SQL_WMS_PLAYA_PEDIDOS.format(col_pedido=OT_COL_PEDIDO, ph=ph),
                chunk,
            )
            cols = [c[0] for c in cur.description]
            for row in cur.fetchall():
                d = dict(zip(cols, row))
                nro = d.get("NroPedido")
                ot_id = d.get("Ot")
                if nro is None or ot_id is None:
                    continue
                n = int(nro)
                prev = wms.get(n)
                # Nos quedamos con la OT de mayor OTId (más reciente) de TODAS
                # las de Picking del pedido — no solo de las que están en playa
                # (FIX 2026-08-24): si la más nueva es un repick En Proceso
                # tiene que ganar ella y frenar al pedido, aunque todavía no
                # haya dejado nada en playa. Mismo criterio "más reciente
                # manda" que la función legacy.
                if prev is None or int(ot_id) > prev["ot"]:
                    wms[n] = {
                        "ot": int(ot_id),
                        "otEstado": int(d["OTEstado"]) if d.get("OTEstado") is not None else None,
                        "enPlaya": bool(d.get("EnPlaya")),
                        "nroArmador": int(d["NroArmador"]) if d.get("NroArmador") is not None else None,
                        "nombreArmador": (d.get("NombreArmador") or "").strip() or None,
                        "ubicacion": "PLAYA_PEDIDOS",
                    }
    finally:
        conn.close()

    out: list[dict] = []
    for nro, ab in abiertos.items():
        w = wms.get(nro)
        if w is None:
            # Sin OT de Picking en WMS.
            continue
        if not w.get("enPlaya"):
            # Ningún renglón de su OT de Picking más reciente está en
            # PLAYA_PEDIDOS — todavía no está listo para Mesa de Control.
            continue
        if w.get("otEstado") != 2:
            # FIX 2026-08-24: está en playa pero la OT sigue En Proceso (el
            # armador todavía está pickeando, o hay un repick abierto). No se
            # controla hasta que WMS la marque Cumplida.
            continue
        out.append({
            "nroPedido": nro,
            "fecha": ab["fecha"],
            "tipoPedido": ab["tipoPedido"],
            "cliente": ab["cliente"],
            "codCliente": ab["codCliente"],
            "prioridad": ab["prioridad"],
            "nroRemito": 0,          # fila "por pedido" (ver docstring: acopio va por vuelta)
            "ubicacion": w["ubicacion"],
            "ot": w["ot"],
            "nroArmador": w["nroArmador"],
            "nombreArmador": w["nombreArmador"],
        })
    return out


# ── ACOPIO 70/75: vueltas esperando mesa de control ─────────────────────────
# (2026-08-21) Una fila por VUELTA, no por pedido — ver docstring del módulo.
# Solo Magnus: no hace falta cruzar a WMS porque cada vuelta ya es un remito
# (OT1PIC <-> remito es 1 a 1) y `FechaArmado > 0` es el "terminó de
# preparar" que del otro lado se buscaba con PLAYA_PEDIDOS.
#
# El filtro es, literalmente, "armado y todavía sin pasar por mesa":
#     FechaArmado > 0   AND   FechaCierre = 0
# más las dos exclusiones que si no vuelven a trabar el puesto:
#     EstadoRemito 3 (borrador sin emitir = la vuelta fue a buscar y no había
#                     nada) y 4 (anulado)  -> no pasan por mesa nunca
#     remito sin renglones                 -> idem
#
# `fecha` sale de FechaArmado (no de FechaPedido): dentro de cada prioridad la
# cola es FIFO por "desde cuándo está esperando mesa", que para una vuelta es
# el momento en que se terminó de armar. FechaPedido acá no sirve — es la
# misma para todas las vueltas del acopio, que pueden ser 10 a lo largo de un
# año.
#
# BASE DE FECHAS: las fechas de Magnus son "días desde 1800-12-28" (BASE_DATE
# en errores_mesa.py). Se devuelven como int y se convierten en Python, igual
# que FechaPedido — no se toca SQL para eso.
SQL_MAGNUS_ACOPIO_ESPERA_CONTROL = """
SELECT TOP ({limit})
    rmt.NroMovVenta     AS NroRemito,
    cab.NroMovVenta     AS NroPedido,
    rmt.FechaArmado     AS FechaArmado,
    cc.DetalleCorto     AS TipoPedido,
    cli.Cliente_Nombre  AS Cliente,
    cab.CodCliente      AS CodCliente,
    cab.Prioridad       AS Prioridad,
    pca.ObsArmadorMovil AS Ubicacion,
    rmt.OTId            AS Ot,
    rmt.UsuarioArmado   AS NroArmador,
    usr.Nombre          AS NombreArmador
FROM EVERWEAR.dbo.VenFer_RmtoCabecera rmt
INNER JOIN EVERWEAR.dbo.VenFer_PedidoCabecera cab ON cab.NroMovVenta = rmt.NroMovPedido
LEFT JOIN MAGNUS_SITD.dbo.Ven_CodComprobante cc  ON cab.CompCodigo  = cc.CompCodigo
LEFT JOIN MAGNUS_SITD.dbo.Clientes           cli ON cab.CodCliente  = cli.CodCliente
LEFT JOIN EVERWEAR.dbo.Ven_PedImpresoCA      pca ON pca.NroMovVenta = cab.NroMovVenta
LEFT JOIN EVERWEAR.dbo.[Gen_Usuarios]        usr ON usr.Numero      = rmt.UsuarioArmado
WHERE rmt.CompCodigo = 71                 -- remito de acopio
  AND cab.CompCodigo IN (70, 75)          -- el pedido es un acopio
  AND rmt.FechaArmado > 0                 -- la vuelta terminó de armarse
  AND ISNULL(rmt.FechaCierre, 0) = 0      -- y todavía no pasó por mesa
  AND rmt.EstadoRemito NOT IN (3, 4)      -- 3 borrador (vuelta vacía) / 4 anulado
  AND EXISTS (
        SELECT 1 FROM EVERWEAR.dbo.VenFer_RmtoReng rr
        WHERE rr.NroMovVenta = rmt.NroMovVenta
      )
ORDER BY COALESCE(cab.Prioridad, 999) ASC, rmt.FechaArmado ASC
"""


def fetch_acopio_vueltas_espera_control(limit: int = MAGNUS_ABIERTOS_LIMIT) -> list[dict]:
    """Vueltas de acopio (70/75) armadas y todavía sin pasar por mesa de
    control. Una fila por REMITO (`nroRemito`), no por pedido — ver docstring
    del módulo. Misma forma de salida que
    fetch_pedidos_en_playa_pedidos (nroPedido/fecha/tipoPedido/cliente/
    codCliente/prioridad/ubicacion/ot/nroArmador/nombreArmador) más
    `nroRemito`, así refrescar_cola las inserta con el mismo código.

    Solo Magnus: no se consulta WMS (ver comentario junto a la query)."""
    conn = get_connection("EVERWEAR")
    out: list[dict] = []
    try:
        cur = conn.cursor()
        cur.execute("SET DATEFORMAT ymd; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;")
        cur.execute(SQL_MAGNUS_ACOPIO_ESPERA_CONTROL.format(limit=limit))
        cols = [c[0] for c in cur.description]
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            nro_remito, nro_pedido = d.get("NroRemito"), d.get("NroPedido")
            if nro_remito is None or nro_pedido is None:
                continue
            armado = d.get("FechaArmado")
            fecha = (BASE_DATE + timedelta(days=int(armado))) if armado else None
            ubic = d.get("Ubicacion")
            out.append({
                "nroPedido": int(nro_pedido),
                "nroRemito": int(nro_remito),
                "fecha": fecha,
                "tipoPedido": (d.get("TipoPedido") or "").strip() or None,
                "cliente": (d.get("Cliente") or "").strip() or None,
                "codCliente": int(d["CodCliente"]) if d.get("CodCliente") is not None else None,
                "prioridad": int(d["Prioridad"]) if d.get("Prioridad") is not None else None,
                # En acopio la "ubicación" es la física del acopio en playa,
                # que el armador deja escrita en Ven_PedImpresoCA.
                "ubicacion": (str(ubic).strip() or None) if ubic is not None else None,
                "ot": int(d["Ot"]) if d.get("Ot") is not None else None,
                "nroArmador": int(d["NroArmador"]) if d.get("NroArmador") is not None else None,
                "nombreArmador": (d.get("NombreArmador") or "").strip() or None,
            })
    finally:
        conn.close()
    return out


def refrescar_cola(limit: int = MAGNUS_ABIERTOS_LIMIT) -> int:
    """Agrega a deposito.control_asignacion los pedidos Abiertos(Magnus) ∩ en
    PLAYA_PEDIDOS(WMS) que todavía no estén en la cola (ON CONFLICT DO
    NOTHING — no toca los que ya están, asignados o no). Devuelve cuántos se
    agregaron. Se llama al reclamar (asignar_siguiente), no hace falta un
    loop/cron aparte.

    FIX 2026-08-05 (a pedido de Pablo): pasó a usar
    fetch_pedidos_en_playa_pedidos en vez de fetch_pedidos_cumplidos_abiertos
    (criterio "Cumplido" en WMS) — ver esa función y
    fetch_pedidos_cumplidos_abiertos_legacy (se deja sin usar, sin borrar).

    2026-08-21: se le suman las VUELTAS de acopio 70/75
    (fetch_acopio_vueltas_espera_control), que son filas por remito
    ("nroRemito" > 0) y no por pedido. El ON CONFLICT ahora es por
    ("nroPedido", "nroRemito"), así que un mismo acopio puede entrar muchas
    veces —una por vuelta, a lo largo de meses— sin pisarse. Las filas
    no-acopio siguen con "nroRemito" = 0 y se comportan igual que siempre."""
    candidatos = fetch_pedidos_en_playa_pedidos(limit) + fetch_acopio_vueltas_espera_control(limit)
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
                    ("nroPedido", "nroRemito", fecha, "tipoPedido", cliente, "codCliente",
                     "prioridad", ubicacion, ot, "nroArmador", "nombreArmador")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ("nroPedido", "nroRemito") DO NOTHING
                """,
                (
                    c["nroPedido"], c.get("nroRemito", 0), c["fecha"], c["tipoPedido"],
                    c["cliente"], c["codCliente"], c["prioridad"], c["ubicacion"], c["ot"],
                    c["nroArmador"], c["nombreArmador"],
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


def _fetch_remito_controlado(nro_remito: int) -> bool:
    """True si esa VUELTA de acopio ya pasó por mesa de control, o sea si el
    remito tiene `FechaCierre > 0` (fecha nativa de Magnus, días desde
    1800-12-28; 0/NULL = todavía no). `UsuarioCierre` en acopio es el PUESTO
    de mesa (174 = MESA CONTROL 1, 175 = MESA 2, 214 = MESA 3), no una
    persona — no se usa acá, pero es la prueba de que este campo ES el
    control (ver docstring del módulo).

    Este es el gate que reemplaza a `_fetch_pedido_cerrado` para las filas de
    acopio: el PEDIDO de acopio no cierra hasta dentro de meses, la VUELTA
    cierra el mismo día.

    Si el remito no aparece (anulado y purgado, caso raro), se considera
    controlado para no dejar al operario trabado — mismo criterio que
    _fetch_pedido_cerrado."""
    conn = get_connection("EVERWEAR")
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT FechaCierre FROM EVERWEAR.dbo.VenFer_RmtoCabecera WHERE NroMovVenta = ?",
            (nro_remito,),
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


def _fetch_asignacion_cerrada(activa: dict) -> bool:
    """¿La asignación activa del operario ya terminó? Elige el gate según el
    tipo de fila (2026-08-21):

      · "nroRemito" > 0  -> fila de acopio, unidad = la VUELTA. Termina
        cuando ESE remito pasó por mesa (FechaCierre > 0).
      · "nroRemito" = 0  -> fila normal, unidad = el PEDIDO. Termina cuando el
        pedido cierra en Magnus, igual que siempre.

    Este selector es todo el arreglo del problema que trababa el puesto: con
    un acopio asignado, el gate viejo (pedido cerrado) no se cumplía nunca
    porque un acopio queda Abierto durante meses."""
    nro_remito = activa.get("nroRemito") or 0
    if nro_remito:
        return _fetch_remito_controlado(int(nro_remito))
    return _fetch_pedido_cerrado(activa["nroPedido"])


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
            SELECT id, "nroPedido", "nroRemito", fecha, "tipoPedido", cliente, "codCliente",
                   "prioridad", ubicacion, ot, "nroArmador", "nombreArmador",
                   "asignadoA", "asignadoEn"
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
        "id", "nroPedido", "nroRemito", "fecha", "tipoPedido", "cliente", "codCliente",
        "prioridad", "ubicacion", "ot", "nroArmador", "nombreArmador",
        "asignadoA", "asignadoEn",
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
    fija si `nro_operario` ya tiene una asignación activa todavía sin
    terminar — si es así, se le devuelve ESA MISMA fila (no cuenta como un
    reclamo nuevo). Solo si no tiene ninguna o la que tiene ya terminó se
    sigue con el flujo normal de reclamar la próxima libre.

    "Terminó" depende del tipo de fila (2026-08-21, ver
    _fetch_asignacion_cerrada): para acopio 70/75 la unidad es la VUELTA y
    termina cuando el remito pasó por mesa (FechaCierre > 0); para el resto
    es el pedido cerrado en Magnus, como siempre. Antes se usaba el gate del
    pedido para todo y un acopio dejaba al operario trabado para siempre.

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
    if activa is not None and not _fetch_asignacion_cerrada(activa):
        # Sigue con lo suyo: se le devuelve LA MISMA fila. Para acopio "lo
        # suyo" es la vuelta (remito), no el pedido — ver
        # _fetch_asignacion_cerrada.
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
            RETURNING id, "nroPedido", "nroRemito", fecha, "tipoPedido", cliente, "codCliente",
                      "prioridad", ubicacion, ot, "nroArmador", "nombreArmador",
                      "asignadoA", "asignadoEn"
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
        "id", "nroPedido", "nroRemito", "fecha", "tipoPedido", "cliente", "codCliente",
        "prioridad", "ubicacion", "ot", "nroArmador", "nombreArmador",
        "asignadoA", "asignadoEn",
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
    "asignadoEn". Sin ninguno de los dos: HOY. Excluye acopios (CompCodigo 75
    siempre; CompCodigo 70 salvo Prioridad 1/3, mismo criterio que
    SQL_MAGNUS_ABIERTOS_TODOS desde el FIX 2026-08-18) en vivo contra Magnus
    — ver comentario junto al filtro más abajo. Solo lectura."""
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
            SELECT "nroPedido", "nroRemito", "codCliente", cliente,
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

    # Excluye acopios (a pedido de Pablo, 2026-08-03: CompCodigo 70 y 75 —
    # mismo criterio que SQL_MAGNUS_ABIERTOS_TODOS). Esa exclusión en la cola solo
    # frena pedidos NUEVOS al refrescar — pedidos que ya habían quedado
    # guardados en deposito.control_asignacion (de antes del fix, o insertados
    # por otra vía) seguían apareciendo acá porque este historial no
    # filtraba nada, solo leía la tabla. Se filtra en vivo contra
    # VenFer_PedidoCabecera.CompCodigo ANTES de calcular cantidadItems, así
    # ni "Desglose por operario" ni "Detalle por pedido" (ambos salen de
    # `rows`) lo cuentan — ej. pedido 748595 (CompCodigo 70, Flores Marcos).
    #
    # FIX 2026-08-18 (a pedido de Pablo): CompCodigo 70 deja de excluirse
    # entero — ahora entra al historial si Prioridad IN (1, 3), mismo
    # criterio que SQL_MAGNUS_ABIERTOS_TODOS (ver ese comentario para el
    # motivo). CompCodigo 75 se sigue excluyendo siempre, sin cambios. Por
    # eso ahora también se trae Prioridad, no solo CompCodigo.
    nros = sorted({r["nroPedido"] for r in rows if r.get("nroPedido") is not None})
    meta_pedido: dict[int, tuple[int | None, int | None]] = {}  # nro -> (CompCodigo, Prioridad)
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
                    f"SELECT NroMovVenta, CompCodigo, Prioridad FROM dbo.VenFer_PedidoCabecera "
                    f"WHERE NroMovVenta IN ({ph})",
                    chunk,
                )
                for nro, comp, prioridad in cur.fetchall():
                    meta_pedido[int(nro)] = (
                        int(comp) if comp is not None else None,
                        int(prioridad) if prioridad is not None else None,
                    )

            # 2026-08-21: una fila de acopio con "nroRemito" > 0 es una VUELTA
            # controlada de verdad (el operario la trabajó y la mesa la cerró)
            # — tiene que contar en el historial. Lo que se sigue excluyendo
            # es la basura vieja: filas de acopio SIN remito, que son las que
            # entraron por error antes del FIX 2026-08-04 y trababan el
            # puesto (ej. pedido 748595, CompCodigo 70, Flores Marcos). El
            # criterio "Prioridad 1/3" del FIX 2026-08-18 se descarta: era un
            # workaround de que el pedido de acopio no cierra nunca.
            def _es_acopio_sin_vuelta(r: dict) -> bool:
                comp, _prioridad = meta_pedido.get(r["nroPedido"], (None, None))
                if comp not in (70, 75):
                    return False
                return not (r.get("nroRemito") or 0)

            rows = [r for r in rows if not _es_acopio_sin_vuelta(r)]
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
            'SELECT "nroPedido", "nroRemito", fecha, "prioridad", cliente, ubicacion, "asignadoA", "asignadoEn" '
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
