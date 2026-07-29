-- Ajuste manual de ingreso/egreso para /rrhh/asistencia — a pedido de Pablo
-- (2026-07-29). Hoy Ingreso/Egreso salen 100% de los fichajes reales
-- (asistencia.evento vía el CTE `ev` de resumen/route.ts): impar = ingreso,
-- par = egreso, por posición dentro del día. Si un empleado fichó una sola
-- vez en el día (no marcó la salida, o solo hay una marca a la tarde y falta
-- la de la mañana), esa única marca queda mal clasificada y el otro lado
-- directamente no existe.
--
-- Esta tabla permite que un administrador cargue a mano el ingreso y/o el
-- egreso de ese día puntual, sin tocar los fichajes crudos del reloj. Es un
-- override por (employee_no, fecha): cada columna puede completarse por
-- separado (dejar la otra en NULL dice "usá el fichaje real si existe").
-- El resumen hace COALESCE(ajuste, fichaje real) y recalcula los minutos
-- trabajados cuando hay algún ajuste cargado.
--
-- employee_no es el mismo texto que legajo."employeeNo" (sin ltrim), igual
-- convención que asistencia.estado_diario / asistencia.novedad_diaria.
--
-- Correr en Postgres (mismo schema "asistencia") antes de deployar el cambio
-- de resumen/route.ts + page.tsx.

CREATE TABLE IF NOT EXISTS asistencia.ajuste_manual (
  employee_no TEXT NOT NULL,
  fecha       DATE NOT NULL,
  check_in    TIMESTAMPTZ,
  check_out   TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_no, fecha)
);
