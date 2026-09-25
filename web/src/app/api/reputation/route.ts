import { NextRequest, NextResponse } from "next/server";
import { getHumanReputationRecord } from "@/lib/reputationStore";
import { resolveReader } from "@/lib/agentToken";
import { unauthenticated } from "@/lib/session";
import { getAllLoans } from "@/lib/loanStore";
import { computeHumanReputation } from "@/lib/reputationEngine";

export async function GET(req: NextRequest) {
  try {
    // Whose reputation is not the caller's to choose - a credit score read by
    // anyone who knows a nullifier is not a credit score.
    const reader = resolveReader(req);
    if (!reader) return unauthenticated();
    const humanOwner = reader.human;

    const record = getHumanReputationRecord(humanOwner);
    const loans = getAllLoans().filter(
      (l) => l.humanOwner.toLowerCase() === humanOwner.toLowerCase()
    );

    const summary = computeHumanReputation(
      humanOwner,
      loans,
      record.repaymentsCount,
      record.totalInterestPaid
    );

    return NextResponse.json({
      success: true,
      summary,
      fifoModelExplanation:
        "Tranche-based FIFO: Repayments clear your oldest active loans first, immediately pushing forward your facility maturity deadline.",
    });
  } catch (error: any) {
    console.error("[GET /api/reputation] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch reputation summary" },
      { status: 500 }
    );
  }
}
