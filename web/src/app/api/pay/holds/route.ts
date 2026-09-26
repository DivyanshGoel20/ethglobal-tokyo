import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { openHolds } from "@/lib/holdStore";

/** Payments waiting on this human, because Intercepta's verdict said so. */
export async function GET(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  return NextResponse.json({ holds: openHolds(human) });
}
