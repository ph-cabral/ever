// Se ejecuta una sola vez al arrancar el server (antes de atender requests).
// https://nextjs.org/docs/app/guides/instrumentation
//
// Este server (mangueras_ever) no tiene ruta de red IPv6 (ver docker exec +
// curl: "Network unreachable" en las IPv6 de overpass-api.de). Varias APIs
// externas son dual-stack (AAAA + A) — Overpass/OSM, y potencialmente Google
// Places / MercadoLibre. Sin esto, fetch() puede intentar conectar por IPv6
// primero, fallar, y no reintentar por IPv4 (curl sí hace ese fallback solo;
// el fetch de Node no siempre lo hace). Forzamos IPv4 primero para toda la app.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
  }
}
