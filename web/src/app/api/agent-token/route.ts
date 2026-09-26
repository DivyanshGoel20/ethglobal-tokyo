import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { mintAgentToken } from "@/lib/agentToken";
import { getHumanFacilityStats, getSuiFacilityStats } from "@/lib/agentStore";

/**
 * Issue a spending credential to one of your agents.
 *
 * This is the moment the authorisation actually happens. A verified human names
 * a cap and gets back a token their agent carries; every purchase that agent
 * makes afterwards draws on this human's line, bounded by this cap, without
 * asking again. A card, issued once.
 *
 * The token is returned exactly here and never stored, so it cannot be read
 * back out of the app later. Losing it means issuing another.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "agent";
  const days = Number.isFinite(body.days) ? Math.min(Math.max(Number(body.days), 1), 90) : 7;

  // The agent can spend on either rail, and each rail enforces its own line
  // on every payment. Its cap can be at most the larger line's headroom.
  const facility = getHumanFacilityStats(human);
  const available = Math.max(facility.totalAvailableCredit, getSuiFacilityStats(human).availableCredit);

  // A mandate cannot exceed the line it draws on. Asking for more is not an
  // error - it is quietly held to the headroom that actually exists, and the
  // response says what was granted so the caller is never guessing.
  const asked = Number.isFinite(body.capUsd) ? Number(body.capUsd) : available;
  const capUsd = Math.min(Math.max(asked, 0), available);

  if (!(capUsd > 0)) {
    return NextResponse.json(
      {
        error: "No credit headroom to delegate.",
        code: "no_headroom",
        availableCredit: available,
      },
      { status: 409 }
    );
  }

  const { token, grant } = mintAgentToken(human, { capUsd, days, label });

  return NextResponse.json({
    token,
    grant,
    requestedCapUsd: asked,
    availableCredit: available,
    notice:
      "Shown once and not stored. Anything holding this token can borrow against your " +
      "credit line up to the cap, until it expires. Treat it like a card number.",
  });
}
