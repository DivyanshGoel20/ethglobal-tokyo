import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { agentsConfigured, boundIdentity, getApproval, pollApproval, publicView, startApproval, type Approval } from "@/lib/worldAgents";

export const dynamic = "force-dynamic";

/**
 * Link World ID for Agents to this Lifeline account - once, while signed in
 * with World ID already. After this, only that World ID can approve actions
 * for the account's agents. Only the human's session can link; an agent's
 * mandate token cannot.
 */
export async function GET(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  const bound = boundIdentity(human);
  const id = `link:${human.toLowerCase()}`;
  let attempt: Approval | null = getApproval(id);
  if (!bound && attempt?.status === "pending") attempt = await pollApproval(id).catch(() => getApproval(id));
  const linked = boundIdentity(human);
  return NextResponse.json({
    configured: agentsConfigured(),
    linked: !!linked,
    linkedAt: linked?.linkedAt ?? null,
    ...(attempt && !linked ? publicView(attempt) : {}),
  });
}

export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  if (!agentsConfigured()) return NextResponse.json({ success: false, error: "World ID for Agents is not set up here." }, { status: 503 });
  if (boundIdentity(human)) return NextResponse.json({ success: true, linked: true });
  try {
    const a = await startApproval(`link:${human.toLowerCase()}`, human, { kind: "link" });
    return NextResponse.json({ success: true, linked: false, ...publicView(a) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "World ID is unavailable." }, { status: 502 });
  }
}
