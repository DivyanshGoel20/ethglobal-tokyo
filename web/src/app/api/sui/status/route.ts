import { NextRequest, NextResponse } from "next/server";
import { resolveReader } from "@/lib/agentToken";
import { unauthenticated } from "@/lib/session";
import { suiStatus } from "@/lib/suiRail";

/** Whether the Sui rail can be used right now, and what it sells. */
export async function GET(req: NextRequest) {
  if (!resolveReader(req)) return unauthenticated();
  try {
    return NextResponse.json(await suiStatus());
  } catch (err: any) {
    // Reachability is the answer, not an error: the UI offers the rail only
    // when it can actually be used.
    return NextResponse.json({ rail: "sui", configured: false, sellerUp: false, resources: [], reason: err?.message });
  }
}
