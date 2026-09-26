import { NextRequest, NextResponse } from "next/server";
import { bearerFrom, remainingCap, verifyAgentToken } from "@/lib/agentToken";
import { unauthenticated } from "@/lib/session";
import { agentRail, getAgentByAddress, getHumanFacilityStats, getSuiFacilityStats } from "@/lib/agentStore";
import { withSuiState } from "@/lib/suiRail";
import { getAgentWalletUsdc } from "@/lib/walletBalance";

export const dynamic = "force-dynamic";

/**
 * Who am I, for an agent holding a mandate bound to it: its wallet, its rail,
 * what it owes, and what it can still borrow. A general mandate, or one whose
 * agent has been revoked, gets a clear no.
 */
export async function GET(req: NextRequest) {
  const grant = verifyAgentToken(bearerFrom(req.headers.get("authorization")));
  if (!grant) return unauthenticated();
  if (!grant.agentAddress) {
    return NextResponse.json({ error: "This mandate is not bound to one agent.", code: "unbound_mandate" }, { status: 400 });
  }

  const stored = getAgentByAddress(grant.agentAddress);
  if (!stored || (stored.humanOwner || "").toLowerCase() !== grant.human.toLowerCase()) {
    return NextResponse.json(
      { error: "This agent was revoked, or no longer exists. Ask your human to connect it again.", code: "revoked" },
      { status: 410 }
    );
  }

  const rail = agentRail(stored);
  const [agent] = rail === "sui" ? await withSuiState([stored], grant.human) : [stored];
  const owes = rail === "arc" ? agent.outstandingDebt : agent.suiDebt ?? 0;
  const line = rail === "arc" ? getHumanFacilityStats(grant.human).totalAvailableCredit : getSuiFacilityStats(grant.human).availableCredit;
  const capLeft = remainingCap(grant);

  return NextResponse.json({
    agent: {
      name: agent.name,
      address: agent.address,
      rail,
      ...(rail === "sui" ? { suiAddress: agent.suiAddress } : {}),
      status: agent.status,
    },
    mandate: { capUsd: grant.capUsd, remainingUsd: capLeft, expiresAt: grant.expiresAt, label: grant.label },
    owesUsd: owes,
    walletUsd: rail === "arc" ? await getAgentWalletUsdc(agent.address).catch(() => null) : agent.suiWalletUsd ?? null,
    canBorrowUsd: Math.round(Math.min(capLeft, line) * 1e6) / 1e6,
    humanLineHeadroomUsd: line,
  });
}
