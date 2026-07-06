# Buscador de clientes (`/buscador`)

Vista nueva para **prospección comercial**: buscás un artículo (ej. _poleas_), a
nivel país o por provincia, y obtenés una lista de **empresas** y **vendedores**
con dirección, teléfono, web y —cuando se puede— email y WhatsApp. Todo
exportable a Excel.

## Cómo funciona

Cruza hasta cinco fuentes y deduplica:

| Fuente | Qué aporta | Contacto | Requiere |
|---|---|---|---|
| **Google Maps / Places** | Empresas del rubro: nombre, dirección, teléfono, web, ubicación | Teléfono y web públicos | API key + facturación activa en Google Cloud |
| **MercadoLibre** | Vendedores activos del artículo, ubicación, volumen de publicaciones, precio | ML **no** expone tel/email del vendedor | Nada (público) u OAuth para más volumen |
| **OpenStreetMap** | Empresas con el término en el nombre (`name` tag): dirección, tel, web, email si están cargados | Depende de lo que haya cargado en OSM | Nada — sin API key ni facturación |
| **Cylex** | Directorio de negocios AR: nombre, dirección, teléfono | Depende de lo que haya cargado el negocio en Cylex | Nada — sin API key, scrapea páginas HTML permitidas por su `robots.txt` |
| **Páginas Amarillas** | Directorio de negocios AR (mayor cobertura que Cylex): nombre, dirección, teléfono | Depende de lo cargado en el sitio | Cloudflare Worker propio deployado (Puppeteer + Workers AI) — ver más abajo |

OSM y Cylex son alternativas/complemento mientras no tengas `GOOGLE_PLACES_API_KEY`
(Google exige tarjeta para activar facturación aunque uses el crédito gratis).
Ojo: ninguna de las dos busca por rubro/categoría como Google — OSM matchea el
nombre del comercio literalmente contra el artículo buscado (regex) y Cylex
depende de que el negocio esté cargado con esa palabra clave en su ficha —
mucho menor cobertura que Google, sirven como complemento o mientras se
resuelve lo de Google, no como reemplazo 1:1.

**Cylex** (`lib/buscador/cylex.ts`) pega contra `https://www.cylex.com.ar/{palabra}.html`
(páginas de listado, permitidas por su `robots.txt`) y parsea el HTML con regex
— no usa su endpoint de búsqueda con filtros (`/s?...`), que el propio
`robots.txt` del sitio deshabilita. No hay forma de filtrar por provincia del
lado del servidor (esa limitación viene de ahí), así que trae el listado
general del artículo y filtra por provincia en memoria matcheando la
dirección de cada ficha. La estructura del HTML se infirió a mano viendo una
búsqueda real (06-jul-2026); si en algún momento empieza a traer 0 resultados
de forma sistemática, probablemente Cylex cambió el markup de la página y hay
que revisar los regex en `cylex.ts`, no es necesariamente un problema de red.
Se evaluaron también Brave Search API (perdió su capa gratuita en feb-2026,
ahora es paga) y DuckDuckGo (sin API oficial, solo scraping frágil de su HTML)
como fuentes adicionales, pero se descartaron por costo/fragilidad.

### Páginas Amarillas (Cloudflare Browser Rendering + Puppeteer, Worker aparte)

Páginas Amarillas (paginasamarillas.com.ar) es el directorio más grande de AR,
pero es una SPA (Next.js) cuya búsqueda es **100% client-side**: tocar
"Buscar" no navega a una URL nueva. Eso descarta tanto un fetch normal (trae
el shell vacío) como el endpoint simple de Cloudflare (`/json`, que solo abre
una URL y extrae — no puede tipear ni hacer clic).

La solución: un **Cloudflare Worker aparte** en `workers/paginasamarillas-scraper/`
que usa Puppeteer (vía Browser Rendering) para escribir en el buscador, tocar
"Buscar", esperar los resultados, y Workers AI para extraer nombre/dirección/
teléfono del texto ya renderizado (así no depende de conocer las clases CSS
exactas del sitio). El server de Next.js le pega por HTTP a este Worker
(`lib/buscador/paginasamarillas.ts`) — no llama a Cloudflare directo.

**Este Worker es un proyecto separado, con su propio deploy** (no forma parte
del build/deploy de Next.js ni de `Dockerfile.prod` — corre en la red de
Cloudflare, no en tu servidor). Para la primera prueba se deploya a mano
(`npm install`, `wrangler login`, `wrangler deploy` — ver el README de esa
carpeta). Para que se redeploye solo ante cambios, hay un workflow aparte en
`.github/workflows/deploy-pa-worker.yml` (dispara solo con cambios dentro de
`workers/paginasamarillas-scraper/`, usa un secret `CLOUDFLARE_API_TOKEN` del
repo en vez de login interactivo — pasos de activación en el README de esa
carpeta).

**Variables de entorno del server de Next.js** (no de Cloudflare — son la URL
del Worker ya deployado):
```bash
PA_WORKER_URL=       # la URL que imprime `wrangler deploy`
PA_WORKER_SECRET=    # opcional, si protegiste el Worker con `wrangler secret put`
```

Si falta `PA_WORKER_URL`, la fuente se omite con aviso, igual que Google/ML.

**Riesgo conocido, sin verificar (06-jul-2026):** nunca se pudo abrir Chrome
para inspeccionar el DOM real del sitio (la extensión no conectó en toda la
sesión), así que la detección del campo de búsqueda y el botón "Buscar" en
`workers/paginasamarillas-scraper/src/index.ts` es heurística (por
placeholder/aria-label/texto visible), no por selectores confirmados. Si esta
fuente devuelve 0 empresas de forma sistemática, antes de asumir que el sitio
cambió, correr el Worker en local con `X_BROWSER_HEADFUL=true npx wrangler dev`
y mirar el array `debug` de la respuesta (dice en qué paso se cortó).

**Mucho más lento que las otras fuentes** — abre un browser real por
búsqueda (~10-20 s). Por eso en la vista viene **desactivada por defecto**:
en modo "Todo el país" (24 requests secuenciales) sería impráctico tenerla
prendida por defecto. Conviene usarla puntualmente, provincia por provincia.

Si activás "Buscar email / WhatsApp en las webs", para cada empresa con sitio
web se visita la home y `/contacto` y se intenta extraer email, WhatsApp y
teléfono. Es **best-effort**: muchos sitios no los publican o los cargan por
JavaScript.

Cuando elegís **Todo el país**, la vista recorre las 24 provincias una por una
con barra de progreso (cada provincia es un request corto). Por provincia,
Google devuelve hasta 60 resultados.

## Variables de entorno (en el `.env` del server)

> El `.env` no está en git (ver `FLUJO-DE-TRABAJO.md`). Estas variables van en
> el `.env` de la PC de desarrollo para probar local **y** en el `.env` del
> server para producción.

```bash
# --- Google Places (obligatorio para la fuente "empresas") ---
GOOGLE_PLACES_API_KEY=AIza...

# --- MercadoLibre (opcional; para la fuente "vendedores") ---
# Opción A: token directo (vence ~6 h, hay que renovarlo a mano)
ML_ACCESS_TOKEN=APP_USR-...
# Opción B (recomendada): se refresca solo
ML_CLIENT_ID=1234567890
ML_CLIENT_SECRET=xxxxxxxx
ML_REFRESH_TOKEN=TG-xxxxxxxx
```

Si falta `GOOGLE_PLACES_API_KEY`, la fuente Google se omite con un aviso (la app
no se rompe). Si faltan las credenciales de ML, se omite esa fuente.

### Cómo obtener `GOOGLE_PLACES_API_KEY`

1. [Google Cloud Console](https://console.cloud.google.com/) → creá o elegí un proyecto.
2. Activá **Places API (New)** en "APIs y servicios".
3. Activá **facturación** en el proyecto (sin esto la API responde 403).
4. "Credenciales" → **Crear credencial → Clave de API**. Restringíla a Places API.
5. Pegá la clave en `GOOGLE_PLACES_API_KEY`.

**Costos (importante):** Text Search devuelve teléfono y web, que pertenecen al
SKU _Enterprise_ de Google (el más caro). Google da un crédito mensual gratis y
después cobra por cada llamada. Una búsqueda de "Todo el país" puede disparar
~24–72 llamadas. Conviene poner un **presupuesto/alerta** en Google Cloud y, si
hace falta, buscar por provincia en lugar de todo el país. Ver precios:
<https://developers.google.com/maps/billing-and-pricing/pricing>.

### Cómo obtener las credenciales de MercadoLibre

1. [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar/) → "Mis aplicaciones" → crear app.
2. Anotá **App ID** (`ML_CLIENT_ID`) y **Secret Key** (`ML_CLIENT_SECRET`).
3. Hacé el flujo OAuth con scope `offline_access read` para obtener un
   `refresh_token` (`ML_REFRESH_TOKEN`). Con eso la app renueva el access token sola.
   - Alternativa rápida para probar: generá un access token de prueba y ponelo en
     `ML_ACCESS_TOKEN` (vence en ~6 h).

> Nota: el refresh token rota en cada uso. La app lo cachea en memoria mientras el
> contenedor está vivo; si reinicia, vuelve a partir del `ML_REFRESH_TOKEN` del
> `.env`. Para algo 100% autónomo a largo plazo habría que persistir el último
> refresh token (mejora futura).

## Permisos

Se agregó el módulo **`buscador`** (`lib/auth/modules.ts`). Los **ADMIN** lo ven
siempre. Para un usuario común, un admin debe habilitarlo en **/admin/permisos**
(ya viene sugerido por defecto para los sectores `administracion`, `comercial` y
`ventas`).

## Probar

```bash
npm run dev
# abrir http://localhost:3000/buscador  (logueado)
```

En el server: `git pull` + rebuild como siempre (`FLUJO-DE-TRABAJO.md`), con las
variables cargadas en el `.env` del server.

## Límites y notas honestas

- **Email/WhatsApp** salen solo si la empresa los publica en su web; no es 100%.
- **MercadoLibre** no da teléfono ni email del vendedor (privacidad). Sirve para
  detectar quién vende el rubro, dónde y a qué precio.
- **"Compradores"** no existe como dato público; se infieren de empresas del rubro.
- Google limita a **60 resultados por consulta**; por eso se busca por provincia.
- El filtro "hasta N meses" aplica al universo de publicaciones de ML (avisos
  activos); Google no expone antigüedad. Implementado vía un lookup extra a
  `/items` (ML no devuelve `date_created` en la búsqueda) — agrega algunas
  llamadas más por página, pero acotadas por `maxPaginas`.
- **OSM** no tiene "nombre de persona física" ni de dueño/gerente — igual que
  Google y ML. No existe fuente pública argentina gratuita confiable para eso
  (AFIP y el registro de sociedades solo publican razón social/directores, no
  empleados ni decisores comerciales).

## Archivos

```
app/buscador/page.tsx              Vista (cliente): filtros, tabla, export
app/api/buscador/route.ts          API: orquesta fuentes + dedupe + enriquecido
lib/buscador/types.ts              Tipos + columnas compartidas
lib/buscador/provincias.ts         24 provincias + matcher
lib/buscador/util.ts               Dedupe / dominio / teléfono
lib/buscador/google.ts             Cliente Google Places (New)
lib/buscador/mercadolibre.ts       Cliente ML + refresh de token + filtro por meses
lib/buscador/osm.ts                Cliente OpenStreetMap/Overpass (sin API key)
lib/buscador/cylex.ts              Cliente Cylex (scraping HTML, sin API key)
lib/buscador/paginasamarillas.ts   Cliente que le pega al Worker de Cloudflare (ver abajo)
lib/buscador/cloudflareBrowserRendering.ts  Cliente genérico /json de Cloudflare (sin usar hoy)
lib/buscador/enrich.ts             Extracción email/WhatsApp de webs
lib/auth/modules.ts                (editado) alta del módulo "buscador"
workers/paginasamarillas-scraper/  Cloudflare Worker aparte (Puppeteer + Workers AI) — deploy manual, ver su README
```
