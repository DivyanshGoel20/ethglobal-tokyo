import { NextRequest, NextResponse } from "next/server";
import { verifySiweMessage } from "@worldcoin/minikit-js/siwe";
import type { MiniAppWalletAuthSuccessPayload } from "@worldcoin/minikit-js/commands";
import { attachSession } from "@/lib/session";
import { humanForWallet, linkWallet } from "@/lib/walletLinks";
import { mintToken, readToken } from "@/lib/signedToken";

const WALLET_COOKIE = "lifeline_wallet";

/**
 * Sign in from World App with the wallet.
 *
 * Verifies MiniKit's Sign-In with Ethereum against the nonce this server
 * issued. A wallet already linked to a human signs that human in. An unlinked
 * one is remembered for a few minutes in a signed cookie, so the next step -
 * World ID's uniqueness proof, or a link token from the browser - can bind it.
 */
export async function POST(req: NextRequest) {
  const { payload, linkToken } = (await req.json().catch(() => ({}))) as {
    payload?: MiniAppWalletAuthSuccessPayload;
    linkToken?: string;
  };
  const nonce = req.cookies.get("lifeline_siwe")?.value;
  if (!payload || !nonce) {
    return NextResponse.json({ verified: false, error: "Start sign-in again: the nonce is missing." }, { status: 400 });
  }

  let wallet: string;
  try {
    const { isValid, siweMessageData } = await verifySiweMessage(payload, nonce);
    if (!isValid || !siweMessageData.address) throw new Error("Signature did not verify");
    wallet = siweMessageData.address;
  } catch (err: any) {
    return NextResponse.json({ verified: false, error: err?.message ?? "Wallet sign-in failed" }, { status: 400 });
  }

  // Opened from a link the human made in their signed-in browser: bind the
  // wallet to that human straight away.
  const link = readToken<{ h: string }>("link", linkToken);
  if (link) {
    const linked = linkWallet(wallet, link.h);
    if (!linked.ok) return NextResponse.json({ verified: false, error: linked.reason }, { status: 409 });
  }

  const human = humanForWallet(wallet);
  const res = NextResponse.json(
    human ? { verified: true, linked: true, nullifierHash: human, wallet } : { verified: true, linked: false, wallet }
  );
  res.cookies.set("lifeline_siwe", "", { path: "/", maxAge: 0 });
  if (human) return attachSession(res, human);

  res.cookies.set(WALLET_COOKIE, mintToken("wallet", { w: wallet }, 15 * 60), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  return res;
}
