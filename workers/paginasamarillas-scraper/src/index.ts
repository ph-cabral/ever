// Worker de Cloudflare (Browser Rendering + Puppeteer + Workers AI) para
// scrapear paginasamarillas.com.ar.
//
// POR QUÉ ESTE WORKER EXISTE (y no un simple llamado REST):
// La búsqueda de Páginas Amarillas es 100% client-side — tocar "Buscar" NO
// navega a una URL nueva, así que el endpoint /json de Browser Rendering
// (que solo abre una URL y extrae) no alcanza. Hace falta un browser real
// que escriba en el buscador y toque el botón, y ESO solo lo puede hacer
// Puppeteer corriendo en un Worker con binding de browser — no una llamada
// REST directa desde el server de Next.js. Por eso este Worker se deploya
// aparte (ver README de esta carpeta) y el server de Next.js le pega por
// HTTP en vez de llamar a Cloudflare directamente.
//
// RIESGO CONOCIDO, SIN VERIFICAR (06-jul-2026): nunca se pudo abrir Chrome
// para inspeccionar el DOM real de paginasamarillas.com.ar (la extensión
// no conectó en toda la sesión), así que la ubicación del campo de búsqueda
// y el botón "Buscar" se detectan de forma heurística (por placeholder /
// aria-label / texto visible), no por selectores CSS confirmados. Si este
// Worker devuelve 0 empresas de forma sistemática, lo primero para revisar
// es si detectó bien el input y el botón (correr con
// `X_BROWSER_HEADFUL=true npx wrangler dev` para verlo en vivo, o revisar
// los logs de `debug` que devuelve la respuesta).
//
// La EXTRACCIÓN de datos (nombre/dirección/teléfono) se hace con Workers AI
// leyendo el texto ya renderizado de la página, en vez de con selectores CSS
// — así no se rompe si Páginas Amarillas cambia el diseño, a costa de algo
// de imprecisión típica de un LLM.
import puppeteer, { type Browser, type ElementHandle } from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  AI: Ai;
  /** Si está seteado, el Worker exige `Authorization: Bearer <valor>`. */
  SHARED_SECRET?: string;
}

interface Empresa {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  localidad: string | null;
}

interface BusquedaBody {
  q?: string;
  provincia?: string;
}

const HOME = "https://www.paginasamarillas.com.ar/";
const MAX_TEXTO_A_IA = 12_000; // recorte para no volar el límite de tokens del modelo.

/**
 * Si el elemento tiene tamaño >0 y no está con display:none/visibility:hidden.
 * Sitios responsive suelen duplicar el mismo texto/botón en versión mobile y
 * desktop, una de las dos oculta por CSS — matchear solo por texto puede
 * agarrar la copia oculta, que después no es clickeable de verdad.
 */
async function esVisible(
  page: import("@cloudflare/puppeteer").Page,
  el: ElementHandle<Element>,
): Promise<boolean> {
  return page
    .evaluate((e) => {
      const r = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return (
        r.width > 0 &&
        r.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    }, el)
    .catch(() => false);
}

/** Recolecta TODOS los matches y prefiere uno visible; si ninguno lo es, devuelve el primero igual (mejor intentar que nada). */
async function elegirVisible(
  page: import("@cloudflare/puppeteer").Page,
  candidatos: ElementHandle<Element>[],
): Promise<ElementHandle<Element> | null> {
  if (candidatos.length === 0) return null;
  for (const el of candidatos) {
    if (await esVisible(page, el)) return el;
  }
  return candidatos[0];
}

async function encontrarInputPorTexto(
  page: import("@cloudflare/puppeteer").Page,
  pistas: string[],
): Promise<ElementHandle<Element> | null> {
  const inputs = await page.$$("input");
  const matches: ElementHandle<Element>[] = [];
  for (const input of inputs) {
    const hint = await page
      .evaluate((el) => {
        const i = el as HTMLInputElement;
        return `${i.placeholder ?? ""} ${i.getAttribute("aria-label") ?? ""} ${i.name ?? ""}`.toLowerCase();
      }, input)
      .catch(() => "");
    if (pistas.some((p) => hint.includes(p))) matches.push(input);
  }
  return elegirVisible(page, matches);
}

async function encontrarBotonBuscar(
  page: import("@cloudflare/puppeteer").Page,
): Promise<ElementHandle<Element> | null> {
  const candidatos = await page.$$(
    "button, a, div[role='button'], span[role='button']",
  );
  const matches: ElementHandle<Element>[] = [];
  for (const el of candidatos) {
    const texto = await page
      .evaluate((e) => (e.textContent ?? "").trim().toLowerCase(), el)
      .catch(() => "");
    if (texto === "buscar" || texto === "buscá") matches.push(el);
  }
  return elegirVisible(page, matches);
}

/**
 * Click "seguro": intenta el click nativo de Puppeteer (simula mouse de
 * verdad, dispara todos los eventos) y si falla con el clásico error de
 * Puppeteer ("Node is either not clickable or not an Element" — pasa cuando
 * el elemento no supera los chequeos de visibilidad/actionability de
 * Puppeteer aunque exista en el DOM), cae a un click de DOM plano vía
 * `el.click()` dentro del browser. Menos "realista" pero mucho más tolerante.
 */
async function clickSeguro(
  page: import("@cloudflare/puppeteer").Page,
  el: ElementHandle<Element>,
): Promise<"nativo" | "fallback-dom"> {
  try {
    await el.click();
    return "nativo";
  } catch {
    await page.evaluate((e) => (e as HTMLElement).click(), el);
    return "fallback-dom";
  }
}

async function extraerConIA(env: Env, q: string, textoPagina: string): Promise<Empresa[]> {
  const prompt = `Extraé cada empresa/negocio que aparezca listado en este texto (son resultados de una búsqueda de "${q}" en Páginas Amarillas Argentina, un directorio de negocios). Para cada empresa devolvé: nombre, direccion (calle+altura+localidad si está), telefono, localidad. Si un dato no aparece, usá null. NO inventes datos que no estén en el texto. Respondé SOLO con JSON válido en este formato exacto, sin texto extra:
{"empresas":[{"nombre":"...","direccion":"...","telefono":"...","localidad":"..."}]}

TEXTO:
${textoPagina.slice(0, MAX_TEXTO_A_IA)}`;

  const ai = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      {
        role: "system",
        content:
          "Extraés listados de empresas de texto de páginas web y devolvés SOLO JSON válido, sin comentarios ni texto adicional.",
      },
      { role: "user", content: prompt },
    ],
  });

  try {
    const raw =
      typeof ai === "string" ? ai : ((ai as { response?: string }).response ?? "");
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw) as { empresas?: unknown };
    if (!Array.isArray(parsed.empresas)) return [];
    return (parsed.empresas as Record<string, unknown>[])
      .map((e) => ({
        nombre: typeof e.nombre === "string" ? e.nombre.trim() : "",
        direccion: typeof e.direccion === "string" ? e.direccion : null,
        telefono: typeof e.telefono === "string" ? e.telefono : null,
        localidad: typeof e.localidad === "string" ? e.localidad : null,
      }))
      .filter((e) => e.nombre);
  } catch {
    return [];
  }
}

async function buscar(
  env: Env,
  q: string,
  provincia?: string,
): Promise<{ empresas: Empresa[]; debug: string[] }> {
  const debug: string[] = [];
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.goto(HOME, { waitUntil: "networkidle2", timeout: 30_000 });
    debug.push("home cargada");

    const searchInput = await encontrarInputPorTexto(page, ["busca", "qué", "que buscas", "keyword"]);
    if (!searchInput) {
      debug.push("NO se encontró el input de búsqueda por texto/placeholder");
      const inputs = await page.$$("input");
      if (inputs.length === 0) throw new Error("La página no tiene ningún <input>");
      await inputs[0].type(q, { delay: 25 });
      debug.push("fallback: se usó el primer <input> de la página");
    } else {
      await searchInput.type(q, { delay: 25 });
      debug.push("input de búsqueda tipeado ok");
    }

    if (provincia && provincia !== "todas") {
      const locInput = await encontrarInputPorTexto(page, ["donde", "dónde", "ubicacion", "location", "ciudad"]);
      if (locInput) {
        await locInput.type(provincia, { delay: 25 });
        debug.push("input de ubicación tipeado ok");
      } else {
        debug.push("no se encontró input de ubicación, se busca sin filtrar por provincia");
      }
    }

    const boton = await encontrarBotonBuscar(page);
    if (!boton) {
      throw new Error("No se encontró el botón 'Buscar' (revisar heurística de texto en index.ts)");
    }
    const tipoClick = await clickSeguro(page, boton);
    debug.push(`botón Buscar clickeado (${tipoClick})`);

    await page.waitForNetworkIdle({ idleTime: 1200, timeout: 20_000 }).catch(() => {
      debug.push("timeout esperando networkIdle tras buscar (puede ser normal)");
    });
    await new Promise((r) => setTimeout(r, 1500)); // margen extra para renders tardíos.

    const textoPagina = await page.evaluate(() => document.body.innerText);
    debug.push(`texto de resultados: ${textoPagina.length} caracteres`);

    const empresas = await extraerConIA(env, q, textoPagina);
    debug.push(`IA extrajo ${empresas.length} empresas`);

    return { empresas, debug };
  } finally {
    await browser?.close().catch(() => {});
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Usar POST con body { q, provincia? }", { status: 405 });
    }
    if (env.SHARED_SECRET) {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.SHARED_SECRET}`) {
        return new Response("No autorizado", { status: 401 });
      }
    }

    let body: BusquedaBody;
    try {
      body = await request.json();
    } catch {
      return new Response("JSON inválido", { status: 400 });
    }
    const q = body.q?.trim();
    if (!q) return new Response("Falta 'q'", { status: 400 });

    try {
      const { empresas, debug } = await buscar(env, q, body.provincia);
      return Response.json({ success: true, q, empresas, debug });
    } catch (e) {
      return Response.json(
        { success: false, error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  },
};
