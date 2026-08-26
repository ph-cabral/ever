# Flujo de trabajo — proyecto `ever`

Guía corta de **dónde se trabaja** y **cómo se sube un cambio**. La regla es siempre la misma:

> **Se edita en la PC de desarrollo → `push` a GitHub → en el server `pull` + rebuild.**
> **Nunca se edita código directo en el server.**

---

## 1. Dónde está cada cosa

| Lugar | Qué es | Detalle |
|---|---|---|
| **PC de desarrollo** | Donde se programa | `pc-0067` → `C:\Users\administrador\Desktop\projects\vicki\ever` (Git Bash) |
| **GitHub (origin)** | Fuente de la verdad | `https://github.com/ph-cabral/ever.git`, rama `main` |
| **Server** | Donde corre la app | `10.10.0.159`, en Docker. App pública en `:3001` |

La app corre con Docker Compose (`docker-compose.prod.yml`):
- servicio **`mangueras-app`** (contenedor `mangueras_ever`) → Next.js, build con `Dockerfile.prod` (hace `prisma generate` + `npm run build`).
- servicio **`indicadores-api`** → API de Python.

---

## 2. Procedimiento estándar

### A) En la PC de desarrollo (editar y subir)

```bash
cd ~/Desktop/projects/vicki/ever

# 1. traer lo último ANTES de tocar nada
git pull

# 2. (editás los archivos)

# 3. revisar qué cambió
git status

# 4. agregar SOLO lo que tocaste (no uses 'git add -A' a lo loco)
git add ruta/al/archivo1 ruta/al/archivo2

# 5. commit + push
git commit -m "descripción corta del cambio"
git push
```

> **Desde el CI/CD, el paso B es automático**: al pushear a `main`, GitHub Actions
> corre `deploy.sh` en el server. Ver `../CICD.md`. El paso manual de abajo queda
> como respaldo (o si el runner está caído).

### B) En el server (publicar, manual / respaldo)

```bash
ssh <usuario>@10.10.0.159
cd <carpeta-del-repo-en-el-server>

./deploy.sh        # hace git pull + rebuild (ver script abajo)
```

Listo: en ~1–2 min el cambio queda online en `http://10.10.0.159:3001`.

---

## 3. Deploy automático en el server (`deploy.sh`)

Está en la raíz del repo. En el server, una sola vez:

```bash
chmod +x deploy.sh
```

Y de ahí en más, cada vez que quieras publicar: `./deploy.sh`.

Si solo cambiaste la app (no la API de indicadores), es más rápido:
```bash
git pull && docker compose -f docker-compose.prod.yml up -d --build mangueras-app
```

> Si `docker compose` (con espacio) no existe en el server, usá `docker-compose` (con guion).

---

## 4. Antes de hacer `push` — checklist de 10 segundos

1. **Sin conflictos de merge a medio resolver.** Que no haya quedado ningún:
   ```bash
   grep -rn '<<<<<<<\|>>>>>>>' app/ lib/
   ```
   Tiene que salir **vacío**. Si aparece algo, resolvelo antes de pushear (esto ya rompió el sorteo una vez).
2. **`git status` muestra solo lo que tocaste.** Si ves cientos de archivos "modificados", es ruido de fin-de-línea (CRLF) — agregá los archivos uno por uno, no todos.

---

## 5. Problemas comunes (ya nos pasaron)

**`fatal: Unable to create '.git/index.lock': File exists`**
Lock fantasma de un git anterior. Con ninguna otra ventana de git abierta:
```bash
rm -f .git/index.lock
```

**Conflictos de merge commiteados** (`<<<<<<<`, `=======`, `>>>>>>>` dentro del código)
Rompen el build / dan error 500. Pasa cuando un `git pull`/`merge` choca y se commitea sin resolver. Buscar con el `grep` del punto 4 y dejar la versión correcta.

**Salen 182 archivos "modificados" y no tocaste nada**
Es CRLF de Windows. No los subas: agregá solo tus archivos por nombre.

**Cambié el `.env` / variables**
El `.env` **no está en git** (cada máquina tiene el suyo). Si agregás una variable nueva, hay que ponerla también en el `.env` del server.

**Cambié algo de base de datos (tabla nueva, columna)**
Las migraciones de Prisma acá se aplican **a mano por SQL** (mirá la carpeta `sql/`). El rebuild de Docker NO toca la base. Aplicá el `.sql` en la base antes/después de publicar.

**Imágenes del sorteo**
- Premios: `.png` en `public/premio/`
- Marcos: `oro/plata/bronce/celeste.jpg` en `public/marcos/`
- Fotos de la gente: carpeta `img_sorteo/` (montada en el server como volumen).

---

## 6. Resumen de un cambio, de punta a punta

```
PC dev:   git pull → editar → git add <archivos> → git commit → git push
Server:   ./deploy.sh
Verificar: abrir http://10.10.0.159:3001
```
