import { NextRequest, NextResponse } from "next/server";
import { clearSession, getHuman } from "@/lib/session";

/**
 * Who is driving this browser.
 *
 * The session cookie is httpOnly, so the page cannot read the nullifier it was
 * issued. This hands back only what the signed cookie already proves, so the
 * dashboard never has to keep its own copy of the human's identity.
 */
export async function GET(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return NextResponse.json({ authenticated: false }, { status: 401 });

  return NextResponse.json({ authenticated: true, nullifierHash: human, human });
}

/** Sign out. The cookie is what authorises spending, so the server voids it. */
export async function DELETE() {
  return clearSession(NextResponse.json({ success: true, signedOut: true }));
}
