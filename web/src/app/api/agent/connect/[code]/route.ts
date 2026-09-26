import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { bearerFrom } from "@/lib/agentToken";
import { claimForApproval, denyConnect, displayCode, finishApproval, getConnect, pollConnect } from "@/lib/agentConnect";
import { headroomFor, provisionAgent } from "@/lib/provisionAgent";
import { getAgentByAddress } from "@/lib/agentStore";
import { suiConfigured } from "@/lib/suiRail";

export const dynamic = "force-dynamic";

/**
 * GET with the agent's secret (Authorization: Bearer <secret>): where the
 * request stands, and the mandate exactly once after approval.
 * GET with the human's session: what is being asked, for the approval page.
 * POST with the human's session: approve or decline.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const secret = bearerFrom(req.headers.get("authorization"));
  if (secret) {
    const r = pollConnect(params.code, secret);
    if (r.status === "unknown") {
      return NextResponse.json({ status: "unknown", error: "No such request, or it expired. Start a new one." }, { status: 404 });
    }
    if (r.status !== "approved") return NextResponse.json(r);
    return NextResponse.json({ status: "approved", ...r.issued });
  }

  const human = getHuman(req);
  if (!human) return unauthenticated();
  const c = getConnect(params.code);
  if (!c) return NextResponse.json({ error: "This request expired or never existed. Ask the agent for a new link." }, { status: 404 });
  if (c.human && c.human !== human) return NextResponse.json({ error: "Another account answered this request." }, { status: 409 });

  const agent = c.agentAddress ? getAgentByAddress(c.agentAddress) : null;
  return NextResponse.json({
    code: displayCode(c.code),
    name: c.name,
    rail: c.rail,
    capUsd: c.capUsd ?? null,
    reason: c.reason ?? null,
    client: c.client ?? null,
    status: c.status,
    createdAt: new Date(c.createdAt).toISOString(),
    expiresAt: new Date(c.expiresAt).toISOString(),
    headroom: { arc: headroomFor(human, "arc"), sui: suiConfigured() ? headroomFor(human, "sui") : 0 },
    suiReady: suiConfigured(),
    ...(agent ? { agent: { address: agent.address, name: agent.name, rail: agent.rail ?? "arc" } } : {}),
  });
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const human = getHuman(req);
  if (!human) return unauthenticated();

  const body = await req.json().catch(() => ({}));
  if (body.action === "deny") {
    return denyConnect(params.code, human)
      ? NextResponse.json({ success: true, status: "denied" })
      : NextResponse.json({ success: false, error: "Already answered, or expired." }, { status: 409 });
  }
  if (body.action !== "approve") return NextResponse.json({ success: false, error: "action is approve or deny" }, { status: 400 });

  const c = claimForApproval(params.code, human);
  if (!c) return NextResponse.json({ success: false, error: "Already answered, or expired." }, { status: 409 });

  const rail = body.rail === "sui" || body.rail === "arc" ? body.rail : c.rail;
  if (rail === "sui" && !suiConfigured()) {
    finishApproval(params.code, null);
    return NextResponse.json({ success: false, error: "Lifeline is not deployed on Sui here. Pick Arc." }, { status: 409 });
  }
  const days = Number.isFinite(body.days) ? Math.min(Math.max(Number(body.days), 1), 90) : 7;
  const capUsd = Number.isFinite(body.capUsd) ? Number(body.capUsd) : c.capUsd;

  try {
    const made = await provisionAgent(human, { rail, label: c.name, days, capUsd });
    if ("error" in made) {
      finishApproval(params.code, null);
      return NextResponse.json({ success: false, ...made }, { status: 409 });
    }
    finishApproval(params.code, made);
    return NextResponse.json({
      success: true,
      status: "approved",
      agent: { address: made.agent.address, rail, suiAddress: made.agent.suiAddress, name: c.name },
      grant: made.grant,
      authorizedOnChain: made.authorizedOnChain,
    });
  } catch (err: any) {
    finishApproval(params.code, null);
    return NextResponse.json({ success: false, error: err?.message ?? "Could not set the agent up." }, { status: 500 });
  }
}
