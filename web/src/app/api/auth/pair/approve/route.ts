import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { approvePairing, isWaiting, newestWaiting } from "@/lib/pairing";

/** From World App, signed in: let the browser showing this code in as me. */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== "string" || !approvePairing(code, human)) {
    return NextResponse.json({ success: false, error: "That code has expired or was already used." }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

/**
 * From World App, signed in: is the code this mini app was opened with still
 * waiting? If not (a stale launch path), the one code that is, if any.
 */
export async function GET(req: NextRequest) {
  if (!getHuman(req)) return unauthenticated();
  const code = (new URL(req.url).searchParams.get("code") ?? "").toUpperCase();
  if (code && isWaiting(code)) return NextResponse.json({ code, waiting: true });
  return NextResponse.json({ code: newestWaiting(), waiting: false, stale: code || null });
}
