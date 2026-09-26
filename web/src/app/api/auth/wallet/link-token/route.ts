import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { mintToken } from "@/lib/signedToken";

/**
 * A ten-minute link that opens Lifeline in World App as this human.
 *
 * For someone who signed up in a browser: World ID will not issue their
 * uniqueness proof a second time, so the phone cannot prove who they are on
 * its own. The signed-in browser vouches instead, once, and the wallet that
 * opens the link is bound to this human.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();

  const token = mintToken("link", { h: human }, 10 * 60);
  const appId = process.env.NEXT_PUBLIC_MINIAPP_ID || process.env.NEXT_PUBLIC_WORLD_APP_ID || "";
  const path = `/mini?link=${encodeURIComponent(token)}`;
  return NextResponse.json({
    success: true,
    url: `https://world.org/mini-app?app_id=${appId}&path=${encodeURIComponent(path)}`,
    expiresInSeconds: 600,
  });
}
