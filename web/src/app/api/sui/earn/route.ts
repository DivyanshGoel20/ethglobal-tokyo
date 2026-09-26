import { NextRequest, NextResponse } from "next/server";
import { requireOwnedAgent } from "@/lib/session";
import { payAgentForWork } from "@/lib/suiRail";

/**
 * Test networks only: pay an agent in demo dollars.
 *
 * A closed demo has no customers, so this stands in for one paying the agent
 * for its work - which is the only way an agent here ends up holding what it
 * owes. The payment itself is real and on chain.
 */
export async function POST(req: NextRequest) {
  const { agentAddress, amount } = await req.json().catch(() => ({}));
  if (!agentAddress) return NextResponse.json({ success: false, error: "agentAddress is required" }, { status: 400 });

  const owned = requireOwnedAgent(req, agentAddress);
  if ("error" in owned) return owned.error;

  const usd = Math.min(Math.max(Number(amount) || 0, 0), 5);
  if (!(usd > 0)) return NextResponse.json({ success: false, error: "amount must be between 0 and 5" }, { status: 400 });

  try {
    return NextResponse.json({ success: true, amountUsd: usd, ...(await payAgentForWork(agentAddress, usd)) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Could not pay the agent" }, { status: 400 });
  }
}
