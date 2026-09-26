import { NextRequest, NextResponse } from "next/server";
import { resolveReader } from "@/lib/agentToken";
import { unauthenticated } from "@/lib/session";
import { obligationsFor } from "@/lib/suiRail";

/**
 * This human's parked repayments on Sui, read back from chain.
 *
 * Scoped by railDebt, which records each draw against the session human at the
 * moment of borrowing - the chain knows agents, not people. An obligation with
 * no row here belongs to nobody this route can name, so it is not shown.
 */
export async function GET(req: NextRequest) {
  const reader = resolveReader(req);
  if (!reader) return unauthenticated();
  try {
    const obligations = await obligationsFor(reader.human);
    return NextResponse.json({
      obligations,
      owedUsd: Math.round(obligations.reduce((n, o) => n + o.owedUsd, 0) * 10000) / 10000,
    });
  } catch (err: any) {
    return NextResponse.json({ obligations: [], owedUsd: 0, error: err?.message });
  }
}
