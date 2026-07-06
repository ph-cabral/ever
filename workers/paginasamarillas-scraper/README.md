# everwear-paginasamarillas-scraper

Cloudflare Worker aparte (no forma parte del deploy de Next.js) que scrapea
paginasamarillas.com.ar simulando la búsqueda con Puppeteer y extrayendo los
datos con Workers AI. Ver el comentario al inicio de `src/index.ts` para el
porqué de este diseño.

## Por qué es un proyecto aparte

El endpoint REST simple de Cloudflare (`/json` de Browser Rendering) solo
"abre una URL y extrae" — no sirve acá porque la búsqueda de Páginas
Amarillas es client-side y no genera una URL de resultados. Hace falta un
browser que escriba y haga clic, y eso requiere un Worker con Puppeteer, no
una llamada REST desde el server de Next.js.

## Por qué esto NO está en el Dockerfile de la app

Este Worker no corre dentro del contenedor de Next.js — se despliega directo
a la red de Cloudflare (workers.dev), es un runtime totalmente aparte. Además
`wrangler login` es interactivo (abre un navegador), así que no puede vivir
en un build de Docker ni correr en cada deploy de la app. El deploy de este
Worker es independiente del deploy de `ever`.

## Deploy — primera vez, a mano (para probar)

```bash
cd workers/paginasamarillas-scraper
npm install
npx wrangler login          # abre el navegador para autenticar tu cuenta
npx wrangler deploy
```

Al terminar, `wrangler` imprime la URL pública del Worker, algo como:

```
https://everwear-paginasamarillas-scraper.<tu-subdominio>.workers.dev
```

Copiá esa URL al `.env` del server de Next.js como `PA_WORKER_URL` (ver
`BUSCADOR.md`).

## Deploy automático (recomendado, vía CI)

Hay un workflow en `.github/workflows/deploy-pa-worker.yml` que redeploya
este Worker solo, cada vez que cambia algo dentro de esta carpeta y se pushea
a `main` — no interfiere con el deploy normal de la app. Usa
`CLOUDFLARE_API_TOKEN` (auth no interactiva) en vez de `wrangler login`.

Para activarlo, una sola vez:
1. Crear un API Token de Cloudflare con permiso **"Workers Scripts - Edit"**
   (Mi perfil → API Tokens → Create Token).
2. Cargarlo como secret del repo: **Settings → Secrets and variables →
   Actions → New repository secret** → nombre `CLOUDFLARE_API_TOKEN`.

Después de eso, cualquier cambio en `workers/paginasamarillas-scraper/`
pusheado a `main` se redeploya solo.

### Opcional pero recomendado: proteger el Worker con un secreto

Sin esto, cualquiera que descubra la URL puede pegarle al Worker y gastar tu
cuota de Browser Rendering / Workers AI:

```bash
npx wrangler secret put SHARED_SECRET
# pegá cualquier string largo y random cuando lo pida
```

Copiá ese mismo valor al `.env` del server de Next.js como `PA_WORKER_SECRET`.

## Probar en local

```bash
npm run dev
# en otra terminal:
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"q":"poleas"}'
```

Si el Worker no encuentra empresas, mirá el array `debug` de la respuesta —
dice en qué paso se cortó (no encontró el input, no encontró el botón
"Buscar", timeout esperando resultados, etc.). Ver la nota de riesgo al
inicio de `src/index.ts`: la detección del input/botón es heurística porque
nunca se pudo inspeccionar el DOM real del sitio.

Para ver el browser en vivo mientras debuggeás:

```bash
X_BROWSER_HEADFUL=true npx wrangler dev
```

## Costos

- Browser Rendering: gratis hasta 10 min de uso de browser por día (plan
  Workers Free); cada búsqueda usa el browser ~10-20 segundos.
- Workers AI: el modelo usado (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
  tiene una cuota gratuita diaria de neurons; una extracción de este tamaño
  consume muy poco.
