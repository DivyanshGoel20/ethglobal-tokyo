import { SUI_FEED_URL } from "./suiRail";

/**
 * May Lifeline fetch this URL on a caller's behalf?
 *
 * Paying for something means the server requesting it, so a URL from an agent
 * is a request the server makes. Public http(s) is fine. Loopback and private
 * networks are refused unless they are one of the sellers this deployment
 * runs itself - otherwise a mandate could have Lifeline probe its own network.
 */
const PRIVATE = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1?\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /\.internal$/i,
  /\.local$/i,
];

function knownOrigins(own?: string): Set<string> {
  const list = [
    process.env.NEXT_PUBLIC_X402_RESOURCE_BASE || "http://localhost:4402",
    SUI_FEED_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    own,
  ];
  const out = new Set<string>();
  for (const u of list) {
    try {
      if (u) out.add(new URL(u).origin);
    } catch {}
  }
  return out;
}

export function resourceUrlProblem(raw: unknown, ownOrigin?: string): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return "url must be a string";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "url is not a valid URL";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Only http and https resources can be bought.";
  if (u.username || u.password) return "URLs with credentials are not accepted.";
  if (knownOrigins(ownOrigin).has(u.origin)) return null;
  if (PRIVATE.some((re) => re.test(u.hostname))) return "That URL points at a private network, which Lifeline will not request.";
  return null;
}
