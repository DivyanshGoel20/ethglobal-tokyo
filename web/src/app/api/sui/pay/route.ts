import { NextRequest, NextResponse } from "next/server";
import { resolveSpender } from "@/lib/agentToken";
import { getAgentByAddress } from "@/lib/agentStore";
import { payOnSui } from "@/lib/suiRail";

/**
 * Buy something on the Sui rail.
 *
 * Same gate as Arc's /api/pay: a World session, or a mandate its human issued,
 * spending only through that human's own agents. The draw is capped by the
 * tightest of the mandate and the headroom left across both rails.
 */
export async function POST(req: NextRequest) {
  const { url, agentAddress } = await req.json().catch(() => ({}));
  if (!url || !agentAddress) {
    return NextResponse.json({ success: false, error: "url and agentAddress are required" }, { status: 400 });
  }

  const auth = resolveSpender(req, agentAddress, "sui");
  if ("error" in auth) return auth.error;

  try {
    const result = await payOnSui({
      url,
      agent: getAgentByAddress(agentAddress)!,
      human: auth.spender.human,
      capUsd: auth.spender.capUsd,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Sui payment failed" }, { status: 400 });
  }
}
