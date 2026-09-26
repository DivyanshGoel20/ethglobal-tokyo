import dns from "node:dns/promises";
import net from "node:net";
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
  /^\[?::ffff:/i,
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

/** Is this IP loopback, private, link-local, or otherwise not the public internet? */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (net.isIPv4(v4)) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/**
 * The same check, plus where the name actually points: a public-looking host
 * that resolves to a private address (127.0.0.1.nip.io, a rebinding domain) is
 * refused too. Lifeline's own sellers are exempt, as above.
 */
export async function checkResourceUrl(raw: unknown, ownOrigin?: string): Promise<string | null> {
  const problem = resourceUrlProblem(raw, ownOrigin);
  if (problem) return problem;
  const u = new URL(raw as string);
  if (knownOrigins(ownOrigin).has(u.origin)) return null;
  try {
    const addrs = await dns.lookup(u.hostname.replace(/^\[|\]$/g, ""), { all: true });
    if (addrs.some((a) => isPrivateIp(a.address))) return "That URL points at a private network, which Lifeline will not request.";
  } catch {
    return "That URL's host does not resolve.";
  }
  return null;
}
