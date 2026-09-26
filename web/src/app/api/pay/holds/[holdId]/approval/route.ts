import { NextRequest, NextResponse } from "next/server";
import { resolveSpender } from "@/lib/agentToken";
import { getHold, resolveHold } from "@/lib/holdStore";
import { holdProblem, releaseHeldPayment } from "@/lib/holdRelease";
import {
  agentsConfigured,
  boundIdentity,
  claimCompletion,
  getApproval,
  markCompleted,
  pollApproval,
  publicView,
  startApproval,
} from "@/lib/worldAgents";

export const dynamic = "force-dynamic";

/**
 * Releasing a held payment with World ID for Agents.
 *
 * POST asks for the human's approval: the agent whose payment was held (with
 * its mandate token) or the human (with their session). The response is a
 * code and a link for the human - never anything that approves by itself.
 * GET is polled; once World ID returns a validated approval from the World ID
 * linked to this account, Lifeline releases the payment, once, and returns
 * the result. Declined in World ID declines the hold. Expired, the wrong
 * person or a failure leaves it held and unpaid.
 */

async function who(req: NextRequest, holdId: string): Promise<{ error: NextResponse } | { human: string }> {
  const hold = getHold(holdId);
  if (!hold) return { error: NextResponse.json({ success: false, error: "No such held payment." }, { status: 404 }) };
  const auth = resolveSpender(req, hold.agentAddress, "arc");
  if ("error" in auth) return { error: auth.error };
  if (auth.spender.human.toLowerCase() !== hold.human.toLowerCase()) {
    return { error: NextResponse.json({ success: false, error: "No such held payment." }, { status: 404 }) };
  }
  return { human: hold.human };
}

export async function POST(req: NextRequest, { params }: { params: { holdId: string } }) {
  if (!agentsConfigured()) return NextResponse.json({ success: false, error: "World ID for Agents is not set up here." }, { status: 503 });
  const w = await who(req, params.holdId);
  if ("error" in w) return w.error;

  const problem = holdProblem(params.holdId, w.human);
  if (problem) return NextResponse.json({ success: false, error: problem.error }, { status: problem.status });
  if (!boundIdentity(w.human)) {
    return NextResponse.json(
      {
        success: false,
        code: "world_id_not_linked",
        error: "The account owner has not linked World ID for Agents yet. They link it once from the dashboard.",
      },
      { status: 409 }
    );
  }

  try {
    const a = await startApproval(`hold:${params.holdId}`, w.human, { kind: "release-hold", holdId: params.holdId });
    return NextResponse.json({ success: true, holdId: params.holdId, ...publicView(a) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "World ID is unavailable." }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { holdId: string } }) {
  const w = await who(req, params.holdId);
  if ("error" in w) return w.error;
  const id = `hold:${params.holdId}`;
  if (!getApproval(id)) return NextResponse.json({ success: false, error: "No approval was requested." }, { status: 404 });

  let a;
  try {
    a = await pollApproval(id);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "World ID is unavailable." }, { status: 502 });
  }
  if (!a) return NextResponse.json({ success: false, error: "No approval was requested." }, { status: 404 });

  if (a.status === "denied" && getHold(params.holdId)?.status === "held") resolveHold(params.holdId, "declined");

  if (a.status === "approved") {
    if (a.completedAt) return NextResponse.json({ success: true, ...publicView(a), payment: a.result });
    if (claimCompletion(id)) {
      try {
        const released = await releaseHeldPayment(params.holdId, w.human);
        const payment = released.ok ? released.result : { success: false, error: released.error };
        markCompleted(id, payment);
        return NextResponse.json({ success: true, ...publicView(a), payment });
      } catch (err: any) {
        const payment = { success: false, error: err?.message ?? "Payment failed" };
        markCompleted(id, payment);
        return NextResponse.json({ success: true, ...publicView(a), payment });
      }
    }
    // Another poll is releasing it right now.
    return NextResponse.json({ success: true, ...publicView(a), status: "pending", releasing: true });
  }

  return NextResponse.json({ success: true, ...publicView(a) });
}
