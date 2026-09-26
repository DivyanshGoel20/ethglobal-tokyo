import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { boundIdentity, agentsConfigured } from "@/lib/worldAgents";
import { lookupsFor } from "@/lib/registry";

export const dynamic = "force-dynamic";

/** For the human: am I in the registry, and which partner apps have looked me up? */
export async function GET(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  const bound = boundIdentity(human);
  return NextResponse.json({
    configured: agentsConfigured(),
    listed: !!bound,
    since: bound ? new Date(bound.linkedAt).toISOString() : null,
    lookups: lookupsFor(human).map((l) => ({ partner: l.partnerName, answered: l.answered, at: new Date(l.at).toISOString() })),
  });
}
