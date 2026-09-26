import { NextRequest, NextResponse } from "next/server";
import { attachSession } from "@/lib/session";
import { collectPairing, startPairing } from "@/lib/pairing";

export const dynamic = "force-dynamic";

// One claim cookie per code. With a single cookie, a browser that started
// two codes kept the claim of whichever answered last - often not the code on
// screen - so approving the code you could see signed nothing in, and the
// human had to scan again.
const claimCookie = (code: string) => `lifeline_pair_${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
const TTL_SECONDS = 10 * 60;

/** Start: a code to show, and a claim kept in this browser's cookie. */
export async function POST() {
  const { code, claim, expiresAt } = startPairing();
  const appId = process.env.NEXT_PUBLIC_MINIAPP_ID || process.env.NEXT_PUBLIC_WORLD_APP_ID || "app_6ad9b6ef952f1c2a9a70a58e05aa9878";
  const url = `https://world.org/mini-app?app_id=${appId}&path=${encodeURIComponent(`/?pair=${code}`)}`;
  const res = NextResponse.json({ code, url, expiresAt });
  res.cookies.set(claimCookie(code), claim, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
  return res;
}

/** Poll the code on screen: signed in once World App approves it. */
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const claim = code ? req.cookies.get(claimCookie(code))?.value : undefined;
  if (!code || !claim) return NextResponse.json({ status: "expired" });
  const r = collectPairing(code, claim);
  if (r.status !== "approved") return NextResponse.json(r);
  const res = attachSession(NextResponse.json({ status: "approved", nullifierHash: r.human }), r.human);
  res.cookies.set(claimCookie(code), "", { path: "/", maxAge: 0 });
  return res;
}
