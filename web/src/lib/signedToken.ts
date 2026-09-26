import crypto from "node:crypto";
import { signPayload } from "./session";

/**
 * Small signed claims, for the steps of sign-in that are not a session.
 *
 * Shares the session secret; each token carries its own type, so a wallet
 * proof can never be presented as a link token or a session, and the other way
 * round.
 */
export function mintToken(typ: string, claims: Record<string, unknown>, ttlSeconds: number): string {
  const payload = Buffer.from(
    JSON.stringify({ ...claims, typ, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function readToken<T extends Record<string, unknown>>(typ: string, token?: string | null): T | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut < 1) return null;
  const payload = token.slice(0, cut);
  const mac = Buffer.from(token.slice(cut + 1));
  const expected = Buffer.from(signPayload(payload));
  if (mac.length !== expected.length || !crypto.timingSafeEqual(mac, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims.typ !== typ) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
    return claims as T;
  } catch {
    return null;
  }
}
