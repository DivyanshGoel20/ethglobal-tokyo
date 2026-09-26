import { NextRequest, NextResponse } from "next/server";
import { bearerFrom } from "@/lib/agentToken";
import { lookup, partnerForKey } from "@/lib/registry";
import { allow } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * For partner apps: how does the human behind this World identifier stand?
 *
 *   GET /api/registry/standing?sub=<the sub from your World ID token>
 *   Authorization: Bearer <your partner key>
 *
 * The `sub` is the one World gave your app for this human, which is Lifeline's
 * own because Lifeline's authorization document lists your callback. The
 * answer is good, delinquent or defaulted per line, and the tier - nothing
 * else - and the human can see that you asked.
 */
export async function GET(req: NextRequest) {
  const partner = partnerForKey(bearerFrom(req.headers.get("authorization")));
  if (!partner) return NextResponse.json({ error: "A partner key is required." }, { status: 401 });
  if (!allow(`registry:${partner.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many lookups. At most 120 a minute." }, { status: 429 });
  }
  const sub = new URL(req.url).searchParams.get("sub")?.trim() ?? "";
  if (!sub || sub.length > 256) return NextResponse.json({ error: "sub is required" }, { status: 400 });
  return NextResponse.json({ registry: "lifeline", partner: partner.id, ...lookup(partner, sub) });
}
