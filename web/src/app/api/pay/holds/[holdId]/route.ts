import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { resolveHold } from "@/lib/holdStore";
import { holdProblem, releaseHeldPayment } from "@/lib/holdRelease";
import { agentsConfigured } from "@/lib/worldAgents";

/**
 * The human's answer to a held payment, from their World session.
 *
 * Declining is always a click. Approving releases money an agent could not
 * spend on its own, so where World ID for Agents is set up it takes a fresh
 * World ID approval instead (`/approval`); a session cookie up to twelve hours
 * old is not enough. An agent's mandate token can do neither here.
 */
export async function POST(req: NextRequest, { params }: { params: { holdId: string } }) {
  const human = getHuman(req);
  if (!human) return unauthenticated();

  const { action } = await req.json().catch(() => ({}));
  if (action !== "approve" && action !== "decline") {
    return NextResponse.json({ success: false, error: "action must be approve or decline" }, { status: 400 });
  }

  const problem = holdProblem(params.holdId, human);
  if (problem) return NextResponse.json({ success: false, error: problem.error }, { status: problem.status });

  if (action === "decline") {
    resolveHold(params.holdId, "declined");
    return NextResponse.json({ success: true, declined: true, holdId: params.holdId });
  }

  if (agentsConfigured()) {
    return NextResponse.json(
      {
        success: false,
        code: "world_id_required",
        error: "Releasing a held payment needs a fresh World ID approval.",
        approval: `/api/pay/holds/${params.holdId}/approval`,
      },
      { status: 403 }
    );
  }

  try {
    const released = await releaseHeldPayment(params.holdId, human);
    if (!released.ok) return NextResponse.json({ success: false, error: released.error }, { status: released.status });
    const { result } = released;
    return NextResponse.json({ ...result, holdId: params.holdId }, { status: result.success ? 200 : result.status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Payment failed" }, { status: 400 });
  }
}
