import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { approvePairing } from "@/lib/pairing";

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
