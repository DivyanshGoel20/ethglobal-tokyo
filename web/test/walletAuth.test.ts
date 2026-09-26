process.env.FLOAT_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { useSandbox } from "./sandbox";
import { attachSession } from "../src/lib/session";
import { mintToken, readToken } from "../src/lib/signedToken";
import { humanForWallet, linkWallet } from "../src/lib/walletLinks";
import { POST as walletPOST } from "../src/app/api/auth/wallet/route";
import { POST as linkPOST } from "../src/app/api/auth/wallet/link/route";
import { POST as linkTokenPOST } from "../src/app/api/auth/wallet/link-token/route";
import { GET as noncePOST } from "../src/app/api/auth/wallet/nonce/route";

useSandbox();
const A = "0x" + "aa".repeat(32);
const B = "0x" + "bb".repeat(32);
const WALLET = "0x" + "12".repeat(20);

const session = (h: string) => `float_session=${attachSession(NextResponse.json({}), h).cookies.get("float_session")!.value}`;
const req = (url: string, cookie?: string, body?: unknown) =>
  new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("a wallet identifies nobody until it is linked, and then only that human", () => {
  assert.equal(humanForWallet(WALLET), null);
  assert.deepEqual(linkWallet(WALLET, A), { ok: true });
  assert.equal(humanForWallet(WALLET.toUpperCase().replace("0X", "0x")), A);
  assert.equal(linkWallet(WALLET, B).ok, false, "a wallet was moved to a second human");
  assert.equal(humanForWallet(WALLET), A);
});

test("a token of one kind is never accepted as another", () => {
  const wallet = mintToken("wallet", { w: WALLET }, 60);
  assert.equal(readToken("wallet", wallet)?.w, WALLET);
  assert.equal(readToken("link", wallet), null);
  assert.equal(readToken("wallet", wallet.slice(0, -2) + "xx"), null);
  assert.equal(readToken("wallet", mintToken("wallet", { w: WALLET }, -1)), null, "an expired token was accepted");
});

test("linking needs both the World ID session and a signed-in wallet", async () => {
  const noSession = await linkPOST(req("http://t/api/auth/wallet/link"));
  assert.equal(noSession.status, 401);

  const noWallet = await linkPOST(req("http://t/api/auth/wallet/link", session(B)));
  assert.equal(noWallet.status, 400);

  const other = "0x" + "34".repeat(20);
  const cookie = `${session(B)}; lifeline_wallet=${mintToken("wallet", { w: other }, 60)}`;
  const ok = await linkPOST(req("http://t/api/auth/wallet/link", cookie));
  assert.equal(ok.status, 200);
  assert.equal(humanForWallet(other), B);
});

test("a wallet cookie cannot be forged from a link token", async () => {
  const forged = `${session(B)}; lifeline_wallet=${mintToken("link", { w: "0x" + "56".repeat(20) }, 60)}`;
  const res = await linkPOST(req("http://t/api/auth/wallet/link", forged));
  assert.equal(res.status, 400);
});

test("only a signed-in human can mint a link into World App", async () => {
  assert.equal((await linkTokenPOST(req("http://t/api/auth/wallet/link-token"))).status, 401);
  const res = await linkTokenPOST(req("http://t/api/auth/wallet/link-token", session(A)));
  const body = await res.json();
  assert.match(body.url, /^https:\/\/world\.org\/mini-app\?app_id=.*&path=%2Fmini%3Flink%3D/);
});

test("wallet sign-in without the nonce it was issued is refused", async () => {
  const nonce = await noncePOST();
  assert.match((await nonce.json()).nonce, /^[0-9a-f]{32}$/);
  assert.match(nonce.headers.get("set-cookie") || "", /lifeline_siwe=.*HttpOnly/i);
  const res = await walletPOST(req("http://t/api/auth/wallet", undefined, { payload: { address: WALLET, message: "x", signature: "0x" } }));
  assert.equal(res.status, 400);
});

test("a forged SIWE signature is refused", async () => {
  const res = await walletPOST(
    req("http://t/api/auth/wallet", "lifeline_siwe=abcdef0123456789", {
      payload: { status: "success", address: WALLET, message: "not a siwe message", signature: "0x" + "00".repeat(65), version: 2 },
    })
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).verified, false);
});
