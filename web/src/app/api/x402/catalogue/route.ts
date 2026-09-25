import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";

/**
 * What a resource server is selling.
 *
 * Proxied rather than fetched from the browser: the resource servers are plain
 * local services with no CORS headers, and hardcoding the catalogue in the UI
 * would let the listed price drift from the price the 402 actually quotes.
 */
export async function GET(req: NextRequest) {
  if (!getHuman(req)) return unauthenticated();

  const base =
    new URL(req.url).searchParams.get("base") ||
    process.env.NEXT_PUBLIC_X402_RESOURCE_BASE ||
    "http://localhost:4402";

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/catalogue`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`catalogue returned ${res.status}`);

    const { resources } = await res.json();
    return NextResponse.json({
      base,
      resources: Array.isArray(resources) ? resources : [],
    });
  } catch (err: any) {
    // A resource server being down is not an error in Float; it just means
    // there is nothing to buy from it right now.
    return NextResponse.json({ base, resources: [], error: err?.message ?? "unreachable" });
  }
}
