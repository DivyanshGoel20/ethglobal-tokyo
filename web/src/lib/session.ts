import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAgentByAddress } from "./agentStore";

/**
 * Lifeline's session layer.
 *
 * A session says exactly one thing: which World ID nullifier is driving this
 * request. That is the only identity the facility cares about - credit is
 * extended to a unique human, so spending it has to be authorised by that same
 * human rather than by whoever can name their profile id in a request body.
 *
 * The cookie is signed rather than stored. There is no session table to keep in
 * sync with the JSON stores, and nothing to migrate when this moves off a
 * filesystem.
 */

const COOKIE = "lifeline_session";
const TTL_SECONDS = 60 * 60 * 12;
// Which account this browser belongs to, kept after the session ends so the
// next sign-in knows which World ID session to ask for. It authorises nothing:
// signing in still takes a fresh World ID session proof.
const ACCOUNT_COOKIE = "lifeline_account";
const ACCOUNT_TTL_SECONDS = 60 * 60 * 24 * 365;

let cachedSecret: Buffer | null = null;

function secret(): Buffer {
  if (cachedSecret) return cachedSecret;

  const configured = process.env.LIFELINE_SESSION_SECRET;
  if (configured && configured.length >= 32) {
    cachedSecret = Buffer.from(configured, "utf8");
    return cachedSecret;
  }

  // Fail secure, not fail open. A random per-process key still rejects every
  // forged cookie; it just does not survive a restart, so humans re-verify with
  // World. That is the right trade against a hardcoded fallback secret, which
  // would let anyone mint a session for any nullifier they can guess.
  cachedSecret = crypto.randomBytes(32);
  console.warn(
    "[Session] LIFELINE_SESSION_SECRET is unset or shorter than 32 chars. " +
      "Using an ephemeral key: sessions will not survive a restart, and will not " +
      "work at all across more than one server instance. Set it before deploying."
  );
  return cachedSecret;
}

const sign = (payload: string) =>
  crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

/**
 * The same signature primitive, for credentials that are not session cookies.
 * Sharing the secret keeps one thing to configure; the callers stamp their own
 * type into the payload so the two can never be swapped for one another.
 */
export const signPayload = sign;

/** Marks the response as authenticating this World nullifier. */
export function attachSession(res: NextResponse, nullifier: string): NextResponse {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ n: nullifier, exp }), "utf8").toString("base64url");

  res.cookies.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
  const account = Buffer.from(
    JSON.stringify({ n: nullifier, exp: Math.floor(Date.now() / 1000) + ACCOUNT_TTL_SECONDS }),
    "utf8"
  ).toString("base64url");
  res.cookies.set(ACCOUNT_COOKIE, `${account}.${sign(account)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCOUNT_TTL_SECONDS,
  });
  return res;
}

/** The account this browser last signed in as, if any. Not a session. */
export const rememberedAccount = (req: NextRequest): string | null => readClaims(req.cookies.get(ACCOUNT_COOKIE)?.value);

/** Forget the account too, for "not you?". */
export function forgetAccount(res: NextResponse): NextResponse {
  res.cookies.set(ACCOUNT_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export function clearSession(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

/** The verified World nullifier behind this request, or null. */
export function getHuman(req: NextRequest): string | null {
  return readClaims(req.cookies.get(COOKIE)?.value);
}

function readClaims(token?: string): string | null {
  if (!token) return null;

  const cut = token.lastIndexOf(".");
  if (cut < 1) return null;

  const payload = token.slice(0, cut);
  const mac = Buffer.from(token.slice(cut + 1));
  const expected = Buffer.from(sign(payload));

  // timingSafeEqual throws rather than returns false on a length mismatch.
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(mac, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.n !== "string" || !claims.n) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
    return claims.n;
  } catch {
    return null;
  }
}

export const unauthenticated = () =>
  NextResponse.json(
    {
      error: "Verify with World ID before using the credit facility.",
      code: "not_authenticated",
    },
    { status: 401 }
  );

/**
 * Confirms the signed-in human owns this agent.
 *
 * Every route that spends money or signs with a custodied key goes through
 * here. Without it, knowing an agent's address - which `GET /api/agents`
 * publishes - is enough to spend that agent's credit.
 */
export function requireOwnedAgent(
  req: NextRequest,
  agentAddress: string
): { human: string } | { error: NextResponse } {
  const human = getHuman(req);
  if (!human) return { error: unauthenticated() };

  const agent = getAgentByAddress(agentAddress);
  if (!agent) {
    return {
      error: NextResponse.json(
        { error: "No such agent in the Lifeline registry.", code: "unknown_agent" },
        { status: 404 }
      ),
    };
  }

  if ((agent.humanOwner || "").toLowerCase() !== human.toLowerCase()) {
    return {
      error: NextResponse.json(
        { error: "That agent belongs to a different human.", code: "not_your_agent" },
        { status: 403 }
      ),
    };
  }

  return { human };
}
