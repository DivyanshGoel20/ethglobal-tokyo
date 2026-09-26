import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";

/**
 * What a resource server is selling.
 * Returns the active catalogue of x402 pay-per-call services.
 * Queries external port 4402 if running, or falls back to native /api/paid endpoints.
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
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.resources) && data.resources.length > 0) {
        return NextResponse.json({
          base,
          resources: data.resources,
        });
      }
    }
  } catch {}

  // Native internal catalogue fallback
  const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.json({
    base: appBase,
    resources: [
      { path: "/api/paid/signal", price: 0.01, title: "Alpha Signal Intelligence", artifact: "json" },
      { path: "/api/paid/risk-curve", price: 1.0, title: "Exposure curve · 30d", artifact: "svg" },
      { path: "/api/paid/dossier", price: 5.0, title: "Underwriting dossier", artifact: "svg" },
      { path: "/api/paid/unvetted", price: 0.01, title: "Unvetted feed", artifact: "json" },
    ],
  });
}
