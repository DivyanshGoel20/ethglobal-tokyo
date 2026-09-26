import { NextRequest, NextResponse } from "next/server";
import { attachSession } from "@/lib/session";
import { collectPairing, startPairing } from "@/lib/pairing";

export const dynamic = "force-dynamic";

const CLAIM = "lifeline_pair";

/** Start: a code to show, and a claim kept in this browser's cookie. */
export async function POST() {
  const { code, claim, expiresAt } = startPairing();
  const appId = process.env.NEXT_PUBLIC_MINIAPP_ID || process.env.NEXT_PUBLIC_WORLD_APP_ID || "app_6ad9b6ef952f1c2a9a70a58e05aa9878";
  const url = `https://world.org/mini-app?app_id=${appId}&path=${encodeURIComponent(`/?pair=${code}`)}`;
  const res = NextResponse.json({ code, url, expiresAt });
  res.cookies.set(CLAIM, `${code}.${claim}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
  return res;
}

/** Poll: signed in once World App approves. */
export async function GET(req: NextRequest) {
  const [code, claim] = (req.cookies.get(CLAIM)?.value ?? "").split(".");
  if (!code || !claim) return NextResponse.json({ status: "expired" });
  const r = collectPairing(code, claim);
  if (r.status !== "approved") return NextResponse.json(r);
  const res = attachSession(NextResponse.json({ status: "approved", nullifierHash: r.human }), r.human);
  res.cookies.set(CLAIM, "", { path: "/", maxAge: 0 });
  return res;
}
