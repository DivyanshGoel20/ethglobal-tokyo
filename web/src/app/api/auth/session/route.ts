import { NextRequest, NextResponse } from "next/server";
import { clearSession, forgetAccount, getHuman } from "@/lib/session";
import { sessionForHuman } from "@/lib/worldSessions";

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

  return NextResponse.json({
    authenticated: true,
    nullifierHash: human,
    human,
    // Whether this human can sign in again: a World ID session saved to them.
    hasWorldSession: !!sessionForHuman(human),
  });
}

/**
 * Sign out. The cookie is what authorises spending, so the server voids it.
 * The browser still remembers which account it was, so signing back in is a
 * World ID session proof; `?forget=1` drops that too.
 */
export async function DELETE(req: NextRequest) {
  const res = clearSession(NextResponse.json({ success: true, signedOut: true }));
  return new URL(req.url).searchParams.get("forget") ? forgetAccount(res) : res;
}
