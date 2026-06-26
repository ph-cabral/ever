# Buscador de clientes (`/buscador`)

Vista nueva para **prospección comercial**: buscás un artículo (ej. _poleas_), a
nivel país o por provincia, y obtenés una lista de **empresas** y **vendedores**
con dirección, teléfono, web y —cuando se puede— email y WhatsApp. Todo
exportable a Excel.

## Cómo funciona

Cruza dos fuentes y deduplica:

| Fuente | Qué aporta | Contacto |
|---|---|---|
| **Google Maps / Places** | Empresas del rubro: nombre, dirección, teléfono, web, ubicación | Teléfono y web públicos |
| **MercadoLibre** | Vendedores activos del artículo, ubicación, volumen de publicaciones, precio | ML **no** expone tel/email del vendedor |

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
  activos); Google no expone antigüedad.

## Archivos

```
app/buscador/page.tsx              Vista (cliente): filtros, tabla, export
app/api/buscador/route.ts          API: orquesta fuentes + dedupe + enriquecido
lib/buscador/types.ts              Tipos + columnas compartidas
lib/buscador/provincias.ts         24 provincias + matcher
lib/buscador/util.ts               Dedupe / dominio / teléfono
lib/buscador/google.ts             Cliente Google Places (New)
lib/buscador/mercadolibre.ts       Cliente ML + refresh de token
lib/buscador/enrich.ts             Extracción email/WhatsApp de webs
lib/auth/modules.ts                (editado) alta del módulo "buscador"
```
