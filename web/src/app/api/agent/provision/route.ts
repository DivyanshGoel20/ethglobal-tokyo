import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { mintAgentToken } from "@/lib/agentToken";
import { getHumanFacilityStats, getSuiFacilityStats, addAgentToStore } from "@/lib/agentStore";
import { provisionArcAgentWallet } from "@/lib/arc";
import { setAgentPrivateKey } from "@/lib/agentKeys";
import { syncAgentToContractOnChain } from "@/lib/facilityContract";
import { suiAddressFor } from "@/lib/suiRail";

/**
 * Provisions a fresh autonomous agent wallet on Arc Testnet for a verified human.
 * Generates an EVM Arc keypair, binds it to the human's World ID nullifier,
 * issues a spending mandate token, and registers it to the on-chain facility.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();

  const body = await req.json().catch(() => ({}));
  // An agent belongs to one rail: Arc or Sui, never both.
  const rail: "arc" | "sui" = body.rail === "sui" ? "sui" : "arc";
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : `${rail}-agent`;
  const days = Number.isFinite(body.days) ? Math.min(Math.max(Number(body.days), 1), 90) : 7;

  // Capped by the headroom of its own rail's line.
  const available =
    rail === "arc" ? getHumanFacilityStats(human).totalAvailableCredit : getSuiFacilityStats(human).availableCredit;
  const asked = Number.isFinite(body.capUsd) ? Number(body.capUsd) : available;
  const capUsd = Math.min(Math.max(asked, 0), available);

  if (!(capUsd > 0)) {
    return NextResponse.json(
      { error: "No credit headroom to delegate.", code: "no_headroom" },
      { status: 409 }
    );
  }

  // One secp256k1 key: on Arc it is the agent's address; on Sui the same key
  // gives its Sui address. Either way the agent lives on one rail only.
  const wallet = provisionArcAgentWallet();

  // Securely store agent private key for autonomous self-signing
  setAgentPrivateKey(wallet.address, wallet.privateKey);

  // Add agent to local store
  addAgentToStore({
    address: wallet.address,
    name: label,
    humanOwner: human,
    rail,
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

  // Awaited: the agent is handed back ready to spend, and a drawdown the
  // moment provisioning returns used to race an authorisation still in flight
  // and be refused by the facility.
  let authorizedOnChain = true;
  let authorizationError: string | undefined;
  // Only an Arc agent is authorised on the Arc contract.
  if (rail === "arc") try {
    authorizedOnChain = !!(await syncAgentToContractOnChain(wallet.address, human));
    if (!authorizedOnChain) authorizationError = "Arc Testnet authorization did not complete.";
  } catch (err: any) {
    authorizedOnChain = false;
    authorizationError = err?.message || String(err);
    console.warn("[Provision] On-chain authorization failed:", authorizationError);
  }

  const { token, grant } = mintAgentToken(human, {
    capUsd,
    days,
    label,
  });

  return NextResponse.json({
    success: true,
    agent: {
      address: wallet.address,
      rail,
      ...(rail === "sui" ? { suiAddress: suiAddressFor(wallet.address) } : {}),
      apiKey: wallet.apiKey,
      label,
      network: rail === "arc" ? "Arc Testnet (5042002)" : `Sui ${process.env.SUI_NETWORK ?? ""}`.trim(),
    },
    authorizedOnChain,
    ...(authorizationError ? { authorizationError } : {}),
    grant,
    token,
    notice:
      `The token is shown once and not stored. This agent borrows against your ${rail === "arc" ? "Arc" : "Sui"} line up to ` +
      "the cap, and only there; its own wallet is what the repayment debits.",
  });
}
