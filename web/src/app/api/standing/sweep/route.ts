import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAllAgents } from "@/lib/agentStore";
import { enforceStanding, standingHumans } from "@/lib/standing";
import { reconcileSui, suiConfigured } from "@/lib/suiRail";

export const dynamic = "force-dynamic";

/**
 * Check every human's standing and act on it - suspend, default, restore.
 * For a scheduled job (a Railway cron), with LIFELINE_CRON_SECRET as a
 * bearer token. Sui parked repayments that fell due are collected first.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.LIFELINE_CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok =
    !!secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  const sui = suiConfigured() ? await reconcileSui().catch((err) => ({ error: String(err?.message ?? err) })) : null;
  const humans = new Set([...getAllAgents().map((a) => a.humanOwner).filter(Boolean), ...standingHumans()]);
  const changed: { human: string; arc: string; sui: string }[] = [];
  for (const h of humans) {
    const r = await enforceStanding(h).catch(() => null);
    if (r && (r.arc.status !== "good" || r.sui.status !== "good")) {
      changed.push({ human: `${h.slice(0, 10)}…`, arc: r.arc.status, sui: r.sui.status });
    }
  }
  return NextResponse.json({ checked: humans.size, notGood: changed, sui });
}
