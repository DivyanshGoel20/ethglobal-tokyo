import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { getHold, resolveHold } from "@/lib/holdStore";
import { getAgentPrivateKey } from "@/lib/agentKeys";
import { getAgentByAddress } from "@/lib/agentStore";
import { LifelineSigner } from "@/lib/lifelineSigner";
import { invalidateTelemetryCache } from "@/lib/telemetryCache";

/**
 * The human's answer to a held payment.
 *
 * Only a World session can answer - an agent's mandate token cannot approve
 * its own held payment. Approving sends the request again, screened again: if
 * Intercepta now refuses, it is refused, whatever the human said.
 */
export async function POST(req: NextRequest, { params }: { params: { holdId: string } }) {
  const human = getHuman(req);
  if (!human) return unauthenticated();

  const { action } = await req.json().catch(() => ({}));
  if (action !== "approve" && action !== "decline") {
    return NextResponse.json({ success: false, error: "action must be approve or decline" }, { status: 400 });
  }

  const hold = getHold(params.holdId);
  if (!hold || hold.human.toLowerCase() !== human.toLowerCase()) {
    return NextResponse.json({ success: false, error: "No such held payment." }, { status: 404 });
  }
  if (hold.status !== "held") {
    return NextResponse.json({ success: false, error: `Already ${hold.status}.` }, { status: 409 });
  }
  if (hold.expiresAt < Date.now()) {
    return NextResponse.json({ success: false, error: "That hold has expired; ask the agent to try again." }, { status: 410 });
  }
  const agent = getAgentByAddress(hold.agentAddress);
  if (!agent || (agent.humanOwner || "").toLowerCase() !== human.toLowerCase()) {
    return NextResponse.json({ success: false, error: "That agent is no longer yours." }, { status: 403 });
  }

  // Resolved before paying, so a double tap cannot pay twice.
  resolveHold(hold.holdId, action === "approve" ? "approved" : "declined");
  if (action === "decline") return NextResponse.json({ success: true, declined: true, holdId: hold.holdId });

  try {
    const result = await new LifelineSigner().pay(
      hold.url,
      {
        agentAddress: hold.agentAddress,
        agentPrivateKey: getAgentPrivateKey(hold.agentAddress) || undefined,
        humanProfileId: human,
        humanApproved: true,
      },
      { method: hold.method, body: hold.body }
    );
    invalidateTelemetryCache(human);
    return NextResponse.json({ ...result, holdId: hold.holdId }, { status: result.success ? 200 : result.status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Payment failed" }, { status: 400 });
  }
}
