-- Migración: varias novedades por día (cada una con sus horas).
-- Enfoque JSON. La PK sigue siendo (employee_no, fecha).
-- La columna `horas` pasa a guardar la SUMA de horas de todas las novedades
-- del día (compatible con resumen/indicadores y el cálculo de netas/RRHH).
-- Correr una vez en la BD (psql / cliente).

ALTER TABLE asistencia.novedad_diaria
  ADD COLUMN IF NOT EXISTS novedades jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: pasa la novedad única existente al array [{novedad, horas}].
UPDATE asistencia.novedad_diaria
SET novedades = jsonb_build_array(
      jsonb_build_object('novedad', novedad, 'horas', COALESCE(horas, 0))
    )
WHERE novedad IS NOT NULL
  AND (novedades IS NULL OR novedades = '[]'::jsonb);
