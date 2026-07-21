-- Limpia el "Controlador real" (Magnus) que quedó guardado por error en las
-- altas de Mesa de Control durante la 3ra vuelta de cambios del 2026-07-21
-- (insert_error_mesa llegó a resolver fetch_controlador_pedido igual que
-- Calidad, ver errores_mesa.py). Se revirtió a pedido de Pablo: quien carga
-- el widget de Mesa de Control YA ES el controlador parado en la mesa, y
-- Magnus puede traer un control previo/distinto para el mismo pedido — caso
-- real: fila con Registrada=Pablo Cabral, Controlador=Mollina Facundo para
-- el mismo pedido, dos nombres para lo mismo.
--
-- Solo toca filas de origen != 'calidad' Y con "registradoPor" no nulo (esa
-- combinación identifica exactamente las filas insertadas con el código de
-- la 3ra vuelta — las de antes de la 2da vuelta tienen "registradoPor" NULL
-- y dependen del fallback a `controlador` para mostrar "Registrada", así
-- que esas NO se tocan acá).
--
-- IMPORTANTE: `controlador` es NOT NULL desde que se creó la tabla (era
-- obligatoria en el diseño original — nunca se migró un CREATE TABLE a este
-- repo, se armó directo en Postgres). Con la reversión, `insert_error_mesa`
-- deja de mandar valor para esa columna en altas de Mesa de Control ->
-- rompe con "null value in column controlador... violates not-null
-- constraint" si esto no se corre ANTES de deployar el código. Hay que
-- sacar el NOT NULL primero (Calidad y las filas viejas de Mesa de Control
-- siguen escribiendo un valor ahí igual, esto no les afecta).
--
-- Correr en Postgres (n8n_sql, db n8n, schema deposito) ANTES de deployar
-- la reversión en indicadores-api + ever (si no, el widget de Mesa de
-- Control no puede guardar nada).
ALTER TABLE deposito.errores_mesa
  ALTER COLUMN controlador DROP NOT NULL;

UPDATE deposito.errores_mesa
SET controlador = NULL,
    "nroControladorReal" = NULL,
    "nombreControladorReal" = NULL
WHERE origen IS DISTINCT FROM 'calidad'
  AND "registradoPor" IS NOT NULL;
