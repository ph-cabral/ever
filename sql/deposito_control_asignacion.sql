-- Cola de asignación de pedidos para el widget de Mesa de Control (a pedido
-- de Pablo, 2026-07-29). Reemplaza el input manual de "Nro Pedido" por un
-- botón "Asignar": el widget reclama el próximo pedido Cumplido en WMS +
-- Abierto en Magnus (cruce por NroMovVenta = "número de movimiento", ver
-- indicadores-api/control_asignacion.py::fetch_pedidos_cumplidos_abiertos),
-- ordenado por "nroPedido" ascendente y, en empate, fecha descendente.
--
-- ASUNCIÓN (confirmar con Pablo si el criterio real de "orden" es otro): acá
-- "orden" = número de pedido/movimiento en sí, no un campo separado — no se
-- encontró en Magnus/WMS un campo "Orden" distinto de NroMovVenta/NroPedOrigen
-- (son el mismo valor, ver memoria magnus-ven-pedido-armador). Si Pablo quería
-- otro criterio de orden, avisar para ajustar el ORDER BY en asignar_siguiente
-- sin tocar el esquema.
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
