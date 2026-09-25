import { NextRequest, NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action =
      searchParams.get("action") ||
      process.env.NEXT_PUBLIC_WORLD_ACTION ||
      "tokyo-human-verify";

    const rpId =
      searchParams.get("rp_id") ||
      process.env.NEXT_PUBLIC_WORLD_RP_ID ||
      "rp_62d19ed87590c550";

    const signingKeyHex =
      process.env.WORLD_RP_SIGNING_KEY ||
      process.env.PRIVATE_KEY ||
      "0xa08cc8eff40d5e18ffb5de52ff694e861b67836bd48c0eb81b187c4681057460";

    const sig = signRequest({
      action,
      signingKeyHex,
    });

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action =
      body.action ||
      process.env.NEXT_PUBLIC_WORLD_ACTION ||
      "tokyo-human-verify";

    const rpId =
      body.rp_id ||
      process.env.NEXT_PUBLIC_WORLD_RP_ID ||
      "rp_62d19ed87590c550";

    const signingKeyHex =
      process.env.WORLD_RP_SIGNING_KEY ||
      process.env.PRIVATE_KEY ||
      "0xa08cc8eff40d5e18ffb5de52ff694e861b67836bd48c0eb81b187c4681057460";

    const sig = signRequest({
      action,
      signingKeyHex,
    });

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
