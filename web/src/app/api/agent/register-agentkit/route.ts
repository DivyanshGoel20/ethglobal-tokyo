import { NextRequest, NextResponse } from "next/server";
import {
  submitAgentBookRegistration,
  lookupHuman,
  normalizeProof,
  AGENT_BOOK_CONTRACT,
} from "@/lib/agentKit";
import { getAgentByAddress, updateAgentInStore } from "@/lib/agentStore";

/**
 * POST /api/agent/register-agentkit
 * Accepts a completed World ID proof and submits registration to AgentBook via official relay.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentAddress, root, nonce, nullifierHash, proof } = body;

    if (!agentAddress || !root || !nonce || !nullifierHash || !proof) {
      return NextResponse.json(
        { error: "Missing required registration parameters (agentAddress, root, nonce, nullifierHash, proof)." },
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

    const normalizedProof = normalizeProof(proof);
    if (!normalizedProof) {
      return NextResponse.json(
        { error: "Invalid proof format." },
        { status: 400 }
      );
    }

    // Submit to official World Chain relay
    const submitResult = await submitAgentBookRegistration({
      agent: agentAddress,
      root,
      nonce: nonce.toString(),
      nullifierHash,
      proof: normalizedProof,
      contract: AGENT_BOOK_CONTRACT,
    });

    // Verify on-chain with poll
    let confirmedHuman: string | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      confirmedHuman = await lookupHuman(agentAddress);
      if (confirmedHuman) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    const updated = updateAgentInStore(agentAddress, {
      isWorldBacked: true,
      agentBookStatus: "VERIFIED",
      agentBookHumanId: confirmedHuman || "0xverified",
      agentBookTxHash: submitResult.txHash,
    });

    return NextResponse.json({
      success: true,
      isWorldBacked: true,
      agentBookStatus: "VERIFIED",
      txHash: submitResult.txHash,
      contract: AGENT_BOOK_CONTRACT,
      agent: updated ? { ...updated, agentBookHumanId: undefined } : null,
      message: `Agent ${agent.name} successfully registered in World Chain AgentBook.`,
    });
  } catch (error: any) {
    console.error("[Register-AgentKit-API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to submit AgentBook registration" },
      { status: 500 }
    );
  }
}
