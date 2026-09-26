import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { cardEnabled, startCardRepayment, CARD_MINIMUM_USD } from "@/lib/cardRepay";

/** Whether card repayment is on here, and its floor. */
export async function GET() {
  return NextResponse.json({
    enabled: cardEnabled(),
    publishableKey: cardEnabled() ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY : null,
    minimumUsd: CARD_MINIMUM_USD,
  });
}

/**
 * Start a repayment by card, Apple Pay or Google Pay. Only the human, from a
 * World session - an agent's mandate cannot charge its owner's card.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  if (!cardEnabled()) return NextResponse.json({ success: false, error: "Card repayment is not set up here." }, { status: 503 });

  const { agentAddress, amount } = await req.json().catch(() => ({}));
  try {
    const started = await startCardRepayment({ human, agentAddress: String(agentAddress ?? ""), amountUsd: Number(amount) });
    if ("error" in started) return NextResponse.json({ success: false, error: started.error }, { status: started.status });
    return NextResponse.json({ success: true, ...started });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Stripe refused the payment." }, { status: 502 });
  }
}
