# Autenticación y permisos

Login para toda la app, con usuarios vinculados a un **legajo** existente de everwear.
Login por **DNI + contraseña**; los permisos salen del **sector** del legajo.

## Cómo funciona

- **Login** en `/login` (DNI + contraseña).
- **Alta de usuarios**: sólo un **admin**, desde `/admin/usuarios/nuevo`. Se escribe el DNI,
  el sistema busca el legajo y completa el nombre; si existe, se asigna una contraseña.
- **Reseteo de contraseña**: si alguien la olvida, un **admin** se la cambia desde
  `/admin/usuarios` (botón "Contraseña" en la fila): escribe la nueva (mín. 6) y la persona
  entra con esa en su próximo ingreso. No hay autoservicio por email (el login es por DNI).
- **Bootstrap**: si todavía no hay ningún usuario, `/login` muestra "Crear primer usuario"
  y ese primero queda como **administrador** (no hace falta seed manual).
- **Permisos por sector**: editables en `/admin/permisos` (mapa sector → módulos).
  Cada usuario ve sólo los módulos habilitados para su sector. Los admin ven todo.
- **Protección de rutas**: `middleware.ts` exige sesión en todo, salvo `/login` y `/api/auth/*`.
  `/admin/*`, `/db` y `/api/admin/*` requieren rol ADMIN.
- Los cambios de rol o de permisos de un sector **se aplican en el próximo inicio de sesión**
  de la persona (la sesión dura 12 h).

## Para publicar (3 pasos)

1. **Aplicar el SQL** a la base (las migraciones acá son a mano, ver `sql/`):

   ```bash
   psql "$DATABASE_URL" -f sql/usuario_auth.sql
   ```

   Crea `everwear.usuario` y `everwear.sector_permiso`.

2. **Definir `AUTH_SECRET`** en el `.env` (dev) y en el `.env` del server (no está en git).
   Es la clave con la que se firma la cookie de sesión. Mínimo 16 caracteres:

   ```bash
   # generar uno
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # y poner en .env:
   AUTH_SECRET=...el-valor-generado...
   ```

   Sin `AUTH_SECRET` en producción la app no firma sesiones (tira error a propósito).

3. **Regenerar el cliente de Prisma** (cambió el schema). El `Dockerfile.prod` ya corre
   `prisma generate` en el build; en local:

   ```bash
   npx prisma generate
   ```

## Archivos

- Modelo: `prisma/schema.prisma` (`usuario`, `sector_permiso`) + `sql/usuario_auth.sql`
- Núcleo: `lib/auth/` (`modules.ts`, `password.ts`, `session.ts`, `permissions.ts`, `guard.ts`)
- API: `app/api/auth/*` (login, logout, me, legajo, register) y `app/api/admin/*` (usuarios, permisos)
- Vistas: `app/login/`, `app/admin/` (usuarios, nuevo, permisos), `components/auth/`
- Protección: `middleware.ts`
- Home: `app/page.tsx` muestra sólo los módulos permitidos + logout

## Notas técnicas

- Contraseñas: hash **scrypt** (módulo `crypto` de Node, sin dependencias nuevas).
- Sesión: cookie httpOnly firmada con HMAC-SHA256. Se firma en Node y se verifica en el
  middleware (edge) con Web Crypto — mismo secreto y formato.
- El "número de legajo" que se pide es el **DNI** (campo `legajo.dni`).
