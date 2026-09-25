import { NextRequest, NextResponse } from "next/server";
import { FloatSignerTS } from "@/lib/floatSigner";
import { getAgentPrivateKey } from "@/lib/agentKeys";
import { invalidateTelemetryCache } from "@/lib/telemetryCache";
import { resolveSpender } from "@/lib/agentToken";
import { getAgentWalletUsdc } from "@/lib/walletBalance";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, agentAddress, method, body: reqBody } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: url" },
        { status: 400 }
      );
    }

    if (!agentAddress) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: agentAddress" },
        { status: 400 }
      );
    }

    // The route used to take humanProfileId from the body, which is the whole
    // ballgame: the resource server named in `url` also dictates the amount and
    // the payee, so an unauthenticated caller could bill any human they liked
    // and have Float's funding wallet pay an address they controlled. The payer
    // is now whoever holds a World session, and they may only spend through
    // their own agents.
    const auth = resolveSpender(req, agentAddress);
    if ("error" in auth) return auth.error;

    // Server-custodied keys only. A key supplied in the request body was never
    // Float's to sign with.
    const effectiveAgentKey = getAgentPrivateKey(agentAddress) || undefined;

    const floatSigner = new FloatSignerTS();

    const result = await floatSigner.pay(
      url,
      {
        agentAddress,
        agentPrivateKey: effectiveAgentKey,
        humanProfileId: auth.spender.human,
        // The price is only known once the resource answers with a 402, so the
        // ceiling goes in with the request rather than being checked up front.
        maxCreditUsd: auth.spender.capUsd,
      },
      {
        method: method || "GET",
        body: reqBody,
      }
    );

    invalidateTelemetryCache(auth.spender.human);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[POST /api/pay] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "FloatSigner payment execution failed",
      },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentAddress =
      searchParams.get("agentAddress") || searchParams.get("address");

    if (!agentAddress) {
      return NextResponse.json(
        { error: "Missing required parameter: agentAddress" },
        { status: 400 }
      );
    }

    const auth = resolveSpender(req, agentAddress);
    if ("error" in auth) return auth.error;

    const floatSigner = new FloatSignerTS();
    const balance = await floatSigner.getAgentGatewayBalance(agentAddress);

    return NextResponse.json({
      agentAddress,
      gatewayAvailableUSDC: balance.formattedAvailable,
      walletUsdc: await getAgentWalletUsdc(agentAddress),
      floatFundingAddress: floatSigner.fundingAddress,
      creditFacilityAddress: floatSigner.creditFacilityAddress,
    });
  } catch (error: any) {
    console.error("[GET /api/pay] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to query Gateway balance" },
      { status: 500 }
    );
  }
}
