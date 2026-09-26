import { NextRequest, NextResponse } from "next/server";
import { recordMandateSpend } from "@/lib/mandateSpend";
import { hasCredential, resolveSpender } from "@/lib/agentToken";
import { unauthenticated } from "@/lib/session";
import { getAgentByAddress } from "@/lib/agentStore";
import { payOnSui } from "@/lib/suiRail";
import { checkResourceUrl } from "@/lib/resourceUrl";

/**
 * Buy something on the Sui rail.
 *
 * Same gate as Arc's /api/pay: a World session, or a mandate its human issued,
 * spending only through that human's own agents. The draw is capped by the
 * tightest of the mandate and the headroom left across both rails.
 */
export async function POST(req: NextRequest) {
  // Turn an anonymous caller away before describing the request shape.
  if (!hasCredential(req)) return unauthenticated();
  const { url, agentAddress } = await req.json().catch(() => ({}));
  if (!url || !agentAddress) {
    return NextResponse.json({ success: false, error: "url and agentAddress are required" }, { status: 400 });
  }

  const auth = resolveSpender(req, agentAddress, "sui");
  if ("error" in auth) return auth.error;

  const bad = await checkResourceUrl(url, new URL(req.url).origin);
  if (bad) return NextResponse.json({ success: false, error: bad, code: "bad_url" }, { status: 400 });

  try {
    const result = await payOnSui({
      url,
      agent: getAgentByAddress(agentAddress)!,
      human: auth.spender.human,
      capUsd: auth.spender.capUsd,
    });
    // Held for the human (over the agent's spending cap): 202, with the hold.
    if (!result.success) return NextResponse.json(result, { status: 202 });
    recordMandateSpend(auth.spender.mandateId, Number(result.borrowed));
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Sui payment failed" }, { status: 400 });
  }
}
