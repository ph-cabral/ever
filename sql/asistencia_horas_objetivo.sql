-- Horas objetivo por mes para /rrhh (pestaña Ausentismo) — a pedido de Pablo
-- (2026-07-31). Un input carga cuántas horas laborales corresponden en el mes
-- (ej. 300) y se compara contra la suma de horas RRHH (con tope diario, misma
-- lógica que /rrhh/asistencia) acumuladas por cada empleado, para marcar
-- quién cumplió y quién no.
--
-- Correr en Postgres (mismo schema "asistencia") antes de deployar el cambio
-- de AusentismoTab.tsx + horas-objetivo/route.ts + asistenciaIndicadores.ts.

CREATE TABLE IF NOT EXISTS asistencia.horas_objetivo (
  ym              VARCHAR(7) NOT NULL, -- 'YYYY-MM'
  horas_objetivo  INTEGER NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ym)
);
