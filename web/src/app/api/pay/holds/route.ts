import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { openHolds } from "@/lib/holdStore";

/**
 * Payments waiting on this human: flagged by Intercepta, or past an agent's
 * spending cap. `?rail=arc|sui` for one rail's.
 */
export async function GET(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  const rail = new URL(req.url).searchParams.get("rail");
  const holds = openHolds(human).filter((h) => !rail || (h.rail ?? "arc") === rail);
  return NextResponse.json({ holds });
}
