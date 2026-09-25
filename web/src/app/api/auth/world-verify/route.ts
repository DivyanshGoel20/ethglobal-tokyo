import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = body.idkitResponse || body.result || body.proof || body;
    const rpId = body.rp_id || process.env.NEXT_PUBLIC_WORLD_RP_ID || "rp_62d19ed87590c550";
    const action = process.env.NEXT_PUBLIC_WORLD_ACTION || "tokyo-human-verify";

    // As per World ID specification, forward the payload as-is to the verification API
    let v4Payload: any = payload;
    if (!v4Payload.action && action) {
      v4Payload = { ...v4Payload, action };
    }

    // Call World v4 RP verify API
    const v4Response = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v4Payload),
    });

    const v4Data = await v4Response.json().catch(() => ({}));

    if (v4Response.ok && (v4Data.success === true || v4Data.results?.[0]?.success === true)) {
      const nullifier =
        v4Data.nullifier ||
        v4Data.results?.[0]?.nullifier ||
        payload.responses?.[0]?.nullifier ||
        payload.nullifier ||
        payload.nullifier_hash;

      if (!nullifier) {
        return NextResponse.json(
          { verified: false, error: "Missing nullifier in verification response" },
          { status: 400 }
        );
      }

      const res = NextResponse.json({
        verified: true,
        success: true,
        nullifierHash: nullifier,
        credential: "Proof of Human (World ID)",
      });

      res.cookies.set("world_session", String(nullifier), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return res;
    }

    // Handle v4 results array format
    if (v4Data.results && Array.isArray(v4Data.results) && v4Data.results[0]) {
      const item = v4Data.results[0];
      if (item.success === true) {
        const nullifier =
          item.nullifier ||
          v4Data.nullifier ||
          payload.responses?.[0]?.nullifier ||
          payload.nullifier ||
          payload.nullifier_hash;

        if (!nullifier) {
          return NextResponse.json(
            { verified: false, error: "Missing nullifier in verification result" },
            { status: 400 }
          );
        }

        const res = NextResponse.json({
          verified: true,
          success: true,
          nullifierHash: nullifier,
          credential: "Proof of Human (World ID)",
        });

        res.cookies.set("world_session", String(nullifier), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        });

        return res;
      }

      return NextResponse.json(
        { verified: false, error: item.detail || v4Data.detail || "Proof verification failed" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        verified: false,
        error: v4Data.detail || v4Data.message || v4Data.error || "World ID verification failed",
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[World-Verify] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process World ID verification" },
      { status: 500 }
    );
  }
}
