import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { settleEarlyFor } from "@/lib/suiRail";

/**
 * Settle a parked repayment before its date.
 *
 * Session only: repaying moves the agent's coins, which is the human's call,
 * not something a spending mandate should be able to do on its own.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();

  const { obligationId } = await req.json().catch(() => ({}));
  if (!obligationId) {
    return NextResponse.json({ success: false, error: "obligationId is required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, ...(await settleEarlyFor(human, obligationId)) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Could not settle" }, { status: 400 });
  }
}
