import { NextRequest, NextResponse } from "next/server";
import { getAgentByAddress, updateAgentInStore } from "@/lib/agentStore";
import { resolveAgentBookStatus } from "@/lib/agentKit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentAddress, backWithHumanSession } = body;

    if (!agentAddress) {
      return NextResponse.json(
        { error: "Agent address is required." },
        { status: 400 }
      );
    }

    const agent = getAgentByAddress(agentAddress);
    if (!agent) {
      return NextResponse.json(
        { error: `Agent ${agentAddress} not found in Float registry.` },
        { status: 404 }
      );
    }

    // Check live AgentBook lookup on World Chain
    const agentBookInfo = await resolveAgentBookStatus(agent.address);

    if (agentBookInfo.isWorldBacked && agentBookInfo.humanId) {
      const updated = updateAgentInStore(agent.address, {
        isWorldBacked: true,
        agentBookStatus: "VERIFIED",
        agentBookHumanId: agentBookInfo.humanId,
      });

      return NextResponse.json({
        success: true,
        isWorldBacked: true,
        agentBookStatus: "VERIFIED",
        message: `Agent ${agent.name} verified in World Chain AgentBook (0xA23aB2712eA7BBa896930544C7d6636a96b944dA).`,
        agent: updated ? { ...updated, agentBookHumanId: undefined } : null,
      });
    }

    // Unverified in AgentBook on World Chain
    // Ensure store reflects true on-chain state
    updateAgentInStore(agent.address, {
      isWorldBacked: false,
      agentBookStatus: "UNVERIFIED",
      agentBookHumanId: undefined,
    });

    return NextResponse.json({
      success: false,
      isWorldBacked: false,
      agentBookStatus: "UNVERIFIED",
      contract: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA",
      network: "World Chain (eip155:480)",
      message: `Agent ${agent.name} (${agent.address}) is not registered in World Chain AgentBook.`,
    });
  } catch (error: any) {
    console.error("[Verify-AgentKit-API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify AgentKit status" },
      { status: 500 }
    );
  }
}
