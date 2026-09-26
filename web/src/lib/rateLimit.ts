import type { NextRequest } from "next/server";

/**
 * A small in-memory limiter for routes anyone can call. One process holds the
 * counts (the app runs as one instance), and they reset on restart - which is
 * fine for keeping a single caller from filling the disk or starving others.
 */
const hits = new Map<string, number[]>();

export function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

/** True if this key may go ahead: at most `max` calls per `windowMs`. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (!v.some((t) => t > now - windowMs)) hits.delete(k);
  }
  return true;
}
