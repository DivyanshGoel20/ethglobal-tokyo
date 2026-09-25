import { NextRequest, NextResponse } from "next/server";
import {
  createRegistrationBridgeSession,
  pollRegistrationBridgeSession,
  lookupHuman,
} from "@/lib/agentKit";
import { getAgentByAddress } from "@/lib/agentStore";

/**
 * POST /api/agent/registration-session
 * Initializes an in-browser World ID Bridge session for an agent wallet address.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentAddress } = body;

    if (!agentAddress || typeof agentAddress !== "string") {
      return NextResponse.json(
        { error: "agentAddress is required." },
        { status: 400 }
      );
    }

    // Verify agent exists in Float registry
    const agent = getAgentByAddress(agentAddress);
    if (!agent) {
      return NextResponse.json(
        { error: `Agent ${agentAddress} not found in Float registry.` },
        { status: 404 }
      );
    }

    // Check if already registered on World Chain
    const existingHuman = await lookupHuman(agentAddress);
    if (existingHuman) {
      return NextResponse.json({
        alreadyRegistered: true,
        isWorldBacked: true,
        agentAddress,
        message: "Agent is already registered in World Chain AgentBook.",
      });
    }

    // Create real World ID Bridge session
    const session = await createRegistrationBridgeSession(agentAddress);

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      connectorURI: session.connectorURI,
      nonce: session.nonce,
      alreadyRegistered: false,
      agentAddress,
    });
  } catch (error: any) {
    console.error("[RegistrationSession-POST] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initialize registration session" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agent/registration-session?sessionId=...
 * Polls the active World ID Bridge session for user verification in World App.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId query parameter is required." },
        { status: 400 }
      );
    }

    const result = await pollRegistrationBridgeSession(sessionId);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[RegistrationSession-GET] Error:", error);
    return NextResponse.json(
      { status: "REGISTRATION_FAILED", error: error.message || "Polling error" },
      { status: 500 }
    );
  }
}
