-- Tipos de horario por área, para /rrhh/asistencia — a pedido de Pablo
-- (2026-07-22). Hasta ahora el tope diario esperado (topeMin) era una función
-- fija por día de semana (Lun-Jue 540min/9hs, Vie 480min/8hs, Sáb/Dom 0),
-- igual para todos los empleados. Eso rompía el indicador de ausentismo para
-- locales que sí trabajan sábado: sus ausencias en sábado nunca contaban
-- porque el tope de todos era 0 ese día.
--
-- Ahora el tope se resuelve por horario_tipo, y cada área/departamento
-- (mismo texto que ya se ve en "Distribución por área": COALESCE(area.nombre,
-- legajo.sector)) se asigna a un tipo. Un área sin asignación explícita usa
-- el tipo "Estándar (Lun-Vie)" como fallback (= comportamiento anterior, no
-- rompe nada para el resto).
--
-- Correr en Postgres (mismo schema "asistencia" que estado_diario /
-- novedad_diaria) antes de deployar el cambio de indicadores + UI.

CREATE TABLE IF NOT EXISTS asistencia.horario_tipo (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL UNIQUE,
  tope_lun   INT NOT NULL DEFAULT 540,
  tope_mar   INT NOT NULL DEFAULT 540,
  tope_mie   INT NOT NULL DEFAULT 540,
  tope_jue   INT NOT NULL DEFAULT 540,
  tope_vie   INT NOT NULL DEFAULT 480,
  tope_sab   INT NOT NULL DEFAULT 0,
  tope_dom   INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mapea un área/departamento (texto libre, igual al que ya devuelve
-- /api/rrhh/asistencia/resumen) a un horario_tipo. Si un área no tiene fila
-- acá, se le aplica el tipo "Estándar (Lun-Vie)" por defecto.
CREATE TABLE IF NOT EXISTS asistencia.horario_area (
  departamento    TEXT NOT NULL PRIMARY KEY,
  horario_tipo_id INT NOT NULL REFERENCES asistencia.horario_tipo(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: "Estándar" reproduce el topeMin() fijo de siempre (9hs L-J, 8hs Vie,
-- 0 Sáb/Dom). "Con sábado" es para el/los local(es) que además trabajan
-- sábado: 8hs parejas de lunes a sábado, domingo libre. Ajustá los minutos
-- si el reparto real es otro — se edita después desde la UI, no hace falta
-- tocar este seed de nuevo.
INSERT INTO asistencia.horario_tipo (nombre, tope_lun, tope_mar, tope_mie, tope_jue, tope_vie, tope_sab, tope_dom)
VALUES
  ('Estándar (Lun-Vie)',   540, 540, 540, 540, 480, 0,   0),
  ('Con sábado (Lun-Sáb)', 480, 480, 480, 480, 480, 480, 0)
ON CONFLICT (nombre) DO NOTHING;
