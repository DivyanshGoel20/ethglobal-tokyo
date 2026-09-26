import { NextRequest, NextResponse } from "next/server";
import { resolveReader } from "@/lib/agentToken";
import { unauthenticated } from "@/lib/session";
import { appliedStanding, standingOf } from "@/lib/standing";

export const dynamic = "force-dynamic";

/** How this human stands on each rail: good, delinquent (suspended) or defaulted. */
export async function GET(req: NextRequest) {
  const reader = resolveReader(req);
  if (!reader) return unauthenticated();
  const s = standingOf(reader.human);
  const applied = appliedStanding(reader.human);
  return NextResponse.json({
    arc: { ...s.arc, chainTx: applied.arc?.chainTx ?? null },
    sui: { ...s.sui, chainTx: applied.sui?.chainTx ?? null },
  });
}
