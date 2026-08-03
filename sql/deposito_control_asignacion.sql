-- Cola de asignación de pedidos para el widget de Mesa de Control (a pedido
-- de Pablo, 2026-07-29). Reemplaza el input manual de "Nro Pedido" por un
-- botón "Asignar": el widget reclama el próximo pedido Cumplido en WMS +
-- Abierto en Magnus (cruce por NroMovVenta = "número de movimiento", ver
-- indicadores-api/control_asignacion.py::fetch_pedidos_cumplidos_abiertos).
--
-- ORDEN (cambiado 2026-08-03, a pedido de Pablo): "prioridad" ascendente
-- (Magnus VenFer_PedidoCabecera.Prioridad, 1 = más urgente; NULL al final) y,
-- dentro de cada prioridad, fecha ascendente (más viejo primero) — vaciar
-- todos los atrasados de prioridad 1 hasta ponerse al día antes de pasar a
-- prioridad 2. Antes era "nroPedido" ascendente, empate fecha descendente.
--
-- Concurrencia (pedido explícito: nunca asignar el mismo pedido a 2
-- operarios): el reclamo es 1 solo UPDATE atómico con
-- "SELECT ... FOR UPDATE SKIP LOCKED" (ver asignar_siguiente en
-- control_asignacion.py) — 2 operarios apretando "Asignar" al mismo tiempo
-- toman filas distintas, sin lockear toda la tabla ni depender de que la
-- app coordine nada.
--
-- Correr en Postgres (n8n_sql, db n8n, schema deposito) ANTES de deployar el
-- cambio de indicadores-api + ever (widget).

CREATE SCHEMA IF NOT EXISTS deposito;

CREATE TABLE IF NOT EXISTS deposito.control_asignacion (
    id                    serial PRIMARY KEY,
    "nroPedido"           integer NOT NULL,
    fecha                 date,               -- FechaPedido (Magnus)
    "tipoPedido"          text,
    cliente               text,               -- Magnus Clientes.Cliente_Nombre
    "codCliente"          integer,            -- Magnus VenFer_PedidoCabecera.CodCliente
    ubicacion             text,               -- WMS OT Observaciones (fetch_pedido_lookup)
    ot                    integer,
    "nroArmador"          integer,
    "nombreArmador"       text,
    "asignadoA"           text,               -- nombre del controlador (fetch_operario_nombre); NULL = libre en la cola
    "nroOperarioAsignado" integer,
    "asignadoEn"          timestamp,          -- NULL = todavía sin reclamar
    "createdAt"           timestamp NOT NULL DEFAULT now(),
    CONSTRAINT uniq_control_asignacion_pedido UNIQUE ("nroPedido")
);

-- Reclamo del "próximo libre": WHERE "asignadoEn" IS NULL ORDER BY "nroPedido", fecha.
CREATE INDEX IF NOT EXISTS idx_control_asignacion_libres
    ON deposito.control_asignacion ("nroPedido", fecha)
    WHERE "asignadoEn" IS NULL;

-- Para listar "qué se le asignó a X controlador" y compararlo después contra
-- lo que hizo en Magnus (mesa_control.py/fetch_controlador_pedido) — próximo paso.
CREATE INDEX IF NOT EXISTS idx_control_asignacion_asignado_a
    ON deposito.control_asignacion ("asignadoA");

-- Alta 2026-07-31 (a pedido de Pablo): número de cliente además del nombre —
-- el widget lo suma al cuadro grande de arriba. ALTER idempotente: si la
-- tabla ya existía en prod sin esta columna, la agrega; si se crea de cero
-- con el CREATE TABLE de arriba, no hace nada (ya la incluye).
ALTER TABLE deposito.control_asignacion ADD COLUMN IF NOT EXISTS "codCliente" integer;

-- Alta 2026-08-03 (a pedido de Pablo): orden de la cola pasa a ser por
-- prioridad (VenFer_PedidoCabecera.Prioridad de Magnus, 1 = más urgente) y,
-- dentro de cada prioridad, fecha ascendente — vaciar los atrasados de
-- prioridad 1 hasta ponerse al día antes de pasar a prioridad 2. NULL =
-- sin prioridad cargada, se trata como la más baja (ver COALESCE en
-- control_asignacion.py). ALTER idempotente, mismo criterio que "codCliente".
ALTER TABLE deposito.control_asignacion ADD COLUMN IF NOT EXISTS "prioridad" integer;

-- El índice de libres ahora ordena por prioridad+fecha, no por nroPedido.
-- DROP+CREATE porque "CREATE INDEX IF NOT EXISTS" no actualiza un índice ya
-- existente con otra definición.
DROP INDEX IF EXISTS deposito.idx_control_asignacion_libres;
CREATE INDEX idx_control_asignacion_libres
    ON deposito.control_asignacion ("prioridad", fecha)
    WHERE "asignadoEn" IS NULL;
