import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { reconcileSui } from "@/lib/suiRail";

/**
 * Close the books on this human's obligations, collecting any that are due.
 *
 * Session only. A mandate can spend; it cannot declare its own debts paid.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  try {
    return NextResponse.json({ success: true, ...(await reconcileSui(human)) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Reconciliation failed" }, { status: 500 });
  }
}
