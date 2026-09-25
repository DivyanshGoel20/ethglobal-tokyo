import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { mintAgentToken } from "@/lib/agentToken";
import { getHumanFacilityStats, addAgentToStore } from "@/lib/agentStore";
import { provisionArcAgentWallet } from "@/lib/arc";
import { setAgentPrivateKey } from "@/lib/agentKeys";
import { syncAgentToContractOnChain } from "@/lib/facilityContract";

/**
 * Provisions a fresh autonomous agent wallet on Arc Testnet for a verified human.
 * Generates an EVM Arc keypair, binds it to the human's World ID nullifier,
 * issues a spending mandate token, and registers it to the on-chain facility.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "arc-agent";
  const days = Number.isFinite(body.days) ? Math.min(Math.max(Number(body.days), 1), 90) : 7;

  const facility = getHumanFacilityStats(human);
  const asked = Number.isFinite(body.capUsd) ? Number(body.capUsd) : facility.totalAvailableCredit;
  const capUsd = Math.min(Math.max(asked, 0), facility.totalAvailableCredit);

  if (!(capUsd > 0)) {
    return NextResponse.json(
      { error: "No credit headroom to delegate.", code: "no_headroom" },
      { status: 409 }
    );
  }

  // Provision native Arc Testnet agent wallet
  const wallet = provisionArcAgentWallet();

  // Securely store agent private key for autonomous self-signing
  setAgentPrivateKey(wallet.address, wallet.privateKey);

  // Add agent to local store
  addAgentToStore({
    address: wallet.address,
    name: label,
    humanOwner: human,
    creditLimit: capUsd,
    outstandingDebt: 0,
    totalBorrowed: 0,
    totalRepaid: 0,
    currentBalance: 0,
    apiKey: wallet.apiKey,
    status: "Healthy",
    isAutonomous: true,
    isPlatformCreated: true,
    registeredAt: Date.now(),
  });

  // Sync to on-chain Arc FloatCreditFacility contract
  syncAgentToContractOnChain(wallet.address, human).catch((err) => {
    console.warn("[Provision] On-chain sync notice:", err.message);
  });

  const { token, grant } = mintAgentToken(human, {
    capUsd,
    days,
    label,
  });

  return NextResponse.json({
    success: true,
    agent: {
      address: wallet.address,
      apiKey: wallet.apiKey,
      label,
      network: "Arc Testnet (5042002)",
    },
    grant,
    token,
    notice:
      "The token is shown once and not stored. This agent borrows against your line up to " +
      "the cap on Arc Testnet, and its own wallet is what the repayment debits.",
  });
}
