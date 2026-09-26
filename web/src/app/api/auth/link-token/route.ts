import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { mintToken } from "@/lib/signedToken";
import { sessionForHuman } from "@/lib/worldSessions";

/**
 * A link that opens Lifeline in World App as this account.
 *
 * It names the account, nothing more: World App still has to prove the
 * account's World ID session before its wallet is linked. Ten minutes.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  if (!sessionForHuman(human)) {
    return NextResponse.json({ error: "Set up World ID sign-in on this account first.", code: "no_session" }, { status: 409 });
  }
  const token = mintToken("link", { h: human }, 10 * 60);
  const appId = process.env.NEXT_PUBLIC_MINIAPP_ID || process.env.NEXT_PUBLIC_WORLD_APP_ID || "app_6ad9b6ef952f1c2a9a70a58e05aa9878";
  const url = `https://world.org/mini-app?app_id=${appId}&path=${encodeURIComponent(`/?link=${token}`)}`;
  return NextResponse.json({ url, expiresIn: 600 });
}
