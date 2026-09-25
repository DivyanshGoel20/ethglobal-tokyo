import { NextRequest, NextResponse } from "next/server";
import { getPaymentsByAgent, getPaymentsByHuman } from "@/lib/paymentStore";
import { resolveReader } from "@/lib/agentToken";
import { unauthenticated } from "@/lib/session";
import { getAgentByAddress } from "@/lib/agentStore";

export async function GET(req: NextRequest) {
  try {
    // The human comes from the caller, never from the query string. This route
    // used to answer for whatever `?humanOwner=` named, and fell back to
    // returning *every* payment in the system when nothing was named at all.
    const reader = resolveReader(req);
    if (!reader) return unauthenticated();

    const { searchParams } = new URL(req.url);
    const agentAddress = searchParams.get("agentAddress");

    let payments;
    if (agentAddress) {
      const agent = getAgentByAddress(agentAddress);
      if (!agent || (agent.humanOwner || "").toLowerCase() !== reader.human.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: "That agent belongs to a different human.", code: "not_your_agent" },
          { status: 403 }
        );
      }
      payments = getPaymentsByAgent(agentAddress);
    } else {
      payments = getPaymentsByHuman(reader.human);
    }

    return NextResponse.json({
      success: true,
      totalCount: payments.length,
      payments,
    });
  } catch (error: any) {
    console.error("[GET /api/payments] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve payments" },
      { status: 500 }
    );
  }
}
