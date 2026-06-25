-- Crear el primer ADMIN a mano (si el alta web no funciona o querés saltearla).
-- Requiere que ya se haya aplicado sql/usuario_auth.sql.
--
-- PASO 1 — generar el hash de la contraseña (en la PC, con Node). Reemplazá TU_CLAVE:
--   node -e "const c=require('crypto');const s=c.randomBytes(16);console.log('scrypt$'+s.toString('hex')+'$'+c.scryptSync(process.argv[1],s,64).toString('hex'))" 'TU_CLAVE'
--
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
  'PEGAR_HASH_ACA',                      -- <-- hash del PASO 1
  'ADMIN',
  COALESCE(s.nombre, l.sector),          -- sector efectivo
  true,
  now(),
  now()
FROM everwear.legajo l
LEFT JOIN everwear.sector s ON s.id = l."sectorId"
WHERE l.dni = 'PEGAR_DNI_ACA'            -- <-- DNI del legajo
ON CONFLICT DO NOTHING;

-- Verificar:
--   SELECT id, dni, nombre, rol, sector FROM everwear.usuario;
