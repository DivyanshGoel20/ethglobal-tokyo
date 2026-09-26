import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";

// A GET that reads no request is prerendered by `next build`, which froze one
// signature and nonce into the build and served it to every sign-in until it
// expired. Every request needs a fresh one.
export const dynamic = "force-dynamic";

/**
 * Signs the RP context for a World ID request.
 *
 * The action and RP id come from configuration only. Taking them from the
 * query string meant anyone could have Float sign a request for an action it
 * never meant to offer. `?kind=session` asks for the action-less signature a
 * session proof needs - it cannot name an action either. There is no fallback key either: a signing key in
 * source is a signing key everyone has.
 */
export async function GET(req: Request) {
  try {
    // Session requests are signed without an action: World ID 4 sessions do
    // not take one. Everything else signs the configured sign-up action.
    const session = new URL(req.url).searchParams.get("kind") === "session";
    const action = process.env.NEXT_PUBLIC_WORLD_ACTION || "float-credit-line";
    const rpId = process.env.NEXT_PUBLIC_WORLD_RP_ID || "rp_62d19ed87590c550";
    const signingKeyHex = process.env.WORLD_RP_SIGNING_KEY || process.env.WORLD_API_KEY || "";

    if (!signingKeyHex) {
      return NextResponse.json(
        { error: "WORLD_RP_SIGNING_KEY is not configured" },
        { status: 500 }
      );
    }

    const sig = session ? signRequest({ signingKeyHex }) : signRequest({ action, signingKeyHex });

    return NextResponse.json({
      rp_id: rpId,
      nonce: sig.nonce,
      created_at: Number(sig.createdAt),
      expires_at: Number(sig.expiresAt),
      signature: sig.sig,
    });
  } catch (error: any) {
    console.error("[World-RP-Context] Failed to generate RP signature:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate RP signature" },
      { status: 500 }
    );
  }
}
