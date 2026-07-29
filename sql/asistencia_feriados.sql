-- Feriados / días no laborables para /rrhh/asistencia — a pedido de Pablo
-- (2026-07-29). Botón "Feriados" en la página deja marcar días del mes en
-- curso desde un calendario. resumen/route.ts hace LEFT JOIN por fecha y
-- expone `feriado boolean`; el front (page.tsx y asistenciaIndicadores.ts)
-- usa ese flag para que el estado calculado por defecto muestre "Feriado" en
-- vez de "Ausente" cuando no hay fichaje ese día — todos los empleados
-- faltarían igual, así que no tiene sentido contarlo como inasistencia.
--
-- Correr en Postgres (mismo schema "asistencia") antes de deployar el cambio
-- de resumen/route.ts + page.tsx + feriados/route.ts.

CREATE TABLE IF NOT EXISTS asistencia.feriado (
  fecha      DATE NOT NULL,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha)
);
