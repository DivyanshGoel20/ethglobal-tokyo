import { NextRequest, NextResponse } from "next/server";
import { verifyWorldSessionProof } from "@/lib/world";
import { attachSession, getHuman, unauthenticated } from "@/lib/session";
import { humanForSession, linkSession, spendSessionNullifier, touchSession } from "@/lib/worldSessions";

/**
 * World ID 4 session proofs: how a human who already signed up signs in again.
 *
 *   mode "create" - straight after sign-up. The caller already holds the
 *                   cookie the one-time uniqueness proof minted; the new
 *                   session is linked to that human.
 *   mode "prove"  - a returning visit. The session must already be linked;
 *                   whoever it is linked to is who signs in.
 *
 * Either way the proof is verified with World first, and its session
 * nullifier can be used once.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "create" ? "create" : "prove";
  const result = body.result;

  const verified = await verifyWorldSessionProof(result);
  if (!verified.success) {
    return NextResponse.json({ verified: false, error: verified.error, code: verified.code }, { status: 400 });
  }
  if (!spendSessionNullifier(verified.sessionNullifier)) {
    return NextResponse.json(
      { verified: false, error: "That session proof has already been used.", code: "session_proof_replayed" },
      { status: 400 }
    );
  }

  if (mode === "create") {
    // Linking needs the human the uniqueness proof just established. A session
    // on its own proves nothing about uniqueness - one person can open many.
    const human = getHuman(req);
    if (!human) return unauthenticated();
    const linked = linkSession(verified.sessionId, human);
    if (!linked.ok) return NextResponse.json({ verified: false, error: linked.reason }, { status: 409 });
    return NextResponse.json({ verified: true, linked: true, sessionId: verified.sessionId, nullifierHash: human });
  }

  const human = humanForSession(verified.sessionId);
  if (!human) {
    return NextResponse.json(
      {
        verified: false,
        error: "This World ID session is not linked to a Float account. Sign up again from here.",
        code: "unknown_session",
      },
      { status: 404 }
    );
  }
  touchSession(verified.sessionId);
  return attachSession(
    NextResponse.json({ verified: true, success: true, nullifierHash: human, sessionId: verified.sessionId }),
    human
  );
}
