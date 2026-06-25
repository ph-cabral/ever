import { NextRequest, NextResponse } from "next/server";
import {
  moduleForPath,
  isAdminPath,
  type SessionPayload,
} from "@/lib/auth/modules";

// El middleware corre en runtime edge: verifica la firma de la cookie con Web Crypto.
// Debe usar EXACTAMENTE el mismo secreto y formato que lib/auth/session.ts (Node).
const SESSION_COOKIE = "ever_session";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  return "dev-insecure-secret-cambiar-en-produccion";
}

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  if (pad) s += "=".repeat(pad);
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function verifyToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(body)),
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);

  // 1) Sin sesión válida
  if (!session) {
    if (isApi) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("returnTo", pathname + search);
    return NextResponse.redirect(url);
  }

  // 2) Rutas de admin
  if (isAdminPath(pathname) && session.rol !== "ADMIN") {
    if (isApi) return NextResponse.json({ error: "Requiere rol ADMIN" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 3) Permiso por módulo (los ADMIN pasan siempre)
  const mod = moduleForPath(pathname);
  if (mod && session.rol !== "ADMIN" && !session.mods?.includes(mod)) {
    if (isApi) return NextResponse.json({ error: "Sin permiso para este módulo" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("denied", mod);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Protege todo salvo /login, /api/auth/*, internos de Next y archivos estáticos.
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|txt|json|woff|woff2|ttf)$).*)",
  ],
};
