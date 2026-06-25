
-- PASO 2 — pegar el hash y el DNI abajo y correr este archivo:
--   psql "$DATABASE_URL" -f sql/crear_admin_manual.sql
--
-- Toma nombre y sector del legajo que tenga ese DNI. Sector efectivo = relación o string.

INSERT INTO everwear.usuario
  ("legajoId", dni, nombre, "passwordHash", rol, sector, activo, "createdAt", "updatedAt")
SELECT
  l.id,
  l.dni,
  l.nombre,
  '5f0d5f8fc9b7e06027d7a9fe5d01bf267afeb949fb7f4c30d87321024776b6d5', 
  'ADMIN',
  COALESCE(s.nombre, l.sector),
  true,
  now(),
  now()
FROM everwear.legajo l
LEFT JOIN everwear.sector s ON s.id = l."sectorId"
WHERE l.dni = '35307009'            -- <-- DNI del legajo
ON CONFLICT DO NOTHING;

-- Verificar:
--   SELECT id, dni, nombre, rol, sector FROM everwear.usuario;
