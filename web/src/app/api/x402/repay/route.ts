import { NextRequest, NextResponse } from "next/server";
import { POST as repayHandler } from "@/app/api/repay/route";
import { FLOAT_CREDIT_FACILITY_ADDRESS, ARC_TESTNET_CHAIN_ID } from "@/lib/arc";

/**
 * x402 Repay API
 * Settles outstanding agent debt on the Float Credit Facility on Arc Testnet.
 */
export async function POST(req: NextRequest) {
  return repayHandler(req);
}

export async function GET() {
  return NextResponse.json({
    protocol: "x402",
    action: "repay",
    network: "Arc Testnet",
    chainId: ARC_TESTNET_CHAIN_ID,
    facilityAddress: FLOAT_CREDIT_FACILITY_ADDRESS,
    method: "POST",
    description: "Settle outstanding debt on the Float Credit Facility on Arc Testnet. Increases reputation tier upon graduation.",
    requestSchema: {
      agentAddress: "0x... (EVM Agent Wallet Address)",
      amount: "number (USDC to repay, e.g. 5.0)",
      targetAgentAddress: "optional 0x... (sibling agent or self)",
      targetLoanId: "optional string (specific loan tranche)"
    },
    authorization: "Bearer <FLOAT_AGENT_TOKEN> or World ID session cookie"
  });
}
