// Sesión por cookie firmada (HMAC-SHA256 con AUTH_SECRET). Runtime Node.
// El middleware (edge) verifica la firma aparte con Web Crypto; mismo formato.
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { SessionPayload } from "./modules";

export const SESSION_COOKIE = "ever_session";
const MAX_AGE_SEC = 60 * 60 * 12; // 12 horas

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET no configurado: agregalo al .env del server.");
  }
  return "dev-insecure-secret-cambiar-en-produccion";
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function signSession(
  data: Omit<SessionPayload, "iat" | "exp">,
  maxAgeSec = MAX_AGE_SEC,
): { token: string; maxAge: number; payload: SessionPayload } {
  const iat = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { ...data, iat, exp: iat + maxAgeSec };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return { token: `${body}.${sig}`, maxAge: maxAgeSec, payload };
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const json = Buffer.from(
      body.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(json) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Sesión actual leída de la cookie. Para Server Components y route handlers. */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
