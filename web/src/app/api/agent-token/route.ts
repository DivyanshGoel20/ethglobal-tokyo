import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { mintAgentToken } from "@/lib/agentToken";
import { getHumanFacilityStats } from "@/lib/agentStore";

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

  const facility = getHumanFacilityStats(human);

  // A mandate cannot exceed the line it draws on. Asking for more is not an
  // error - it is quietly held to the headroom that actually exists, and the
  // response says what was granted so the caller is never guessing.
  const asked = Number.isFinite(body.capUsd) ? Number(body.capUsd) : facility.totalAvailableCredit;
  const capUsd = Math.min(Math.max(asked, 0), facility.totalAvailableCredit);

  if (!(capUsd > 0)) {
    return NextResponse.json(
      {
        error: "No credit headroom to delegate.",
        code: "no_headroom",
        availableCredit: facility.totalAvailableCredit,
      },
      { status: 409 }
    );
  }

  const { token, grant } = mintAgentToken(human, { capUsd, days, label });

  return NextResponse.json({
    token,
    grant,
    requestedCapUsd: asked,
    availableCredit: facility.totalAvailableCredit,
    notice:
      "Shown once and not stored. Anything holding this token can borrow against your " +
      "credit line up to the cap, until it expires. Treat it like a card number.",
  });
}
