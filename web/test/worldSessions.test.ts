process.env.LIFELINE_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";
process.env.WORLD_RP_SIGNING_KEY = "0x" + "11".repeat(32);

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { useSandbox } from "./sandbox";
import { attachSession } from "../src/lib/session";
import { GET as sessionFor, POST as proveSession } from "../src/app/api/auth/world-session/route";
import { POST as linkToken } from "../src/app/api/auth/link-token/route";
import { GET as rpContext } from "../src/app/api/auth/world-rp-context/route";
import { POST as pairStart, GET as pairPoll } from "../src/app/api/auth/pair/route";
import { POST as pairApprove } from "../src/app/api/auth/pair/approve/route";

/**
 * Signing in again without World ID's one-time uniqueness proof.
 *
 * The Developer Portal's verify call is stood in for (it needs a real phone);
 * everything Lifeline decides around it is real.
 */

useSandbox();
const ALICE = "0x" + "a1".repeat(32);
const BOB = "0x" + "b2".repeat(32);

let portal: { ok: boolean; body: object };
let sent: any[];
beforeEach(() => {
  portal = { ok: true, body: { success: true } };
  sent = [];
  globalThis.fetch = (async (_url: string, init: any) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify(portal.body), { status: portal.ok ? 200 : 400 });
  }) as typeof fetch;
});

const cookieOf = (res: NextResponse, name: string) => res.cookies.get(name)?.value;
const sessionCookie = (human: string) => `lifeline_session=${cookieOf(attachSession(NextResponse.json({}), human), "lifeline_session")}`;
const accountCookie = (human: string) => `lifeline_account=${cookieOf(attachSession(NextResponse.json({}), human), "lifeline_account")}`;

let n = 0;
const proof = (sessionId: string, nullifier = `0x${(++n).toString(16).padStart(4, "0")}`) => ({
  protocol_version: "4.0",
  nonce: "0x01",
  session_id: sessionId,
  environment: "production",
  responses: [{ identifier: "proof_of_human", proof: ["0x0"], session_nullifier: [nullifier, "0x99"], issuer_schema_id: 1, expires_at_min: 0 }],
});

const post = (url: string, body: unknown, cookie = "") =>
  new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { cookie, "content-type": "application/json" } });
const get = (url: string, cookie = "") => new NextRequest(`http://localhost${url}`, { headers: { cookie } });

test("session requests are signed without an action", async () => {
  const withAction = await (await rpContext(get("/api/auth/world-rp-context"))).json();
  const session = await (await rpContext(get("/api/auth/world-rp-context?kind=session"))).json();
  assert.ok(withAction.signature && session.signature);
  assert.notEqual(withAction.signature, session.signature);
});

test("a new session is saved to the human who just joined, and signs them in", async () => {
  const res = await proveSession(post("/api/auth/world-session", { result: proof("session_alice") }, sessionCookie(ALICE)));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).nullifierHash, ALICE);
  assert.equal(sent[0].session_id, "session_alice", "forwarded to the portal as IDKit produced it");
  assert.equal(sent[0].action, undefined, "no action added to a session proof");
});

test("a returning human signs in with the session alone - no cookie, no uniqueness proof", async () => {
  const res = await proveSession(post("/api/auth/world-session", { result: proof("session_alice") }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).nullifierHash, ALICE);
  assert.ok(cookieOf(res, "lifeline_session"), "a session cookie is issued");
});

test("the same proof cannot be used twice", async () => {
  const p = proof("session_alice");
  assert.equal((await proveSession(post("/api/auth/world-session", { result: p }))).status, 200);
  const again = await proveSession(post("/api/auth/world-session", { result: p }));
  assert.equal(again.status, 400);
  assert.equal((await again.json()).code, "proof_replayed");
});

test("a session nobody saved signs nobody in", async () => {
  const res = await proveSession(post("/api/auth/world-session", { result: proof("session_stranger") }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "unknown_session");
});

test("a human's saved session is never silently replaced", async () => {
  const res = await proveSession(post("/api/auth/world-session", { result: proof("session_other") }, sessionCookie(ALICE)));
  assert.equal(res.status, 409);
});

test("a proof the portal rejects is rejected", async () => {
  portal = { ok: false, body: { code: "invalid_proof", detail: "bad proof" } };
  const res = await proveSession(post("/api/auth/world-session", { result: proof("session_alice") }));
  assert.equal(res.status, 400);
});

test("a browser that signed in before is told which session to prove", async () => {
  const mine = await (await sessionFor(get("/api/auth/world-session", accountCookie(ALICE)))).json();
  assert.equal(mine.sessionId, "session_alice");
  const fresh = await (await sessionFor(get("/api/auth/world-session"))).json();
  assert.equal(fresh.sessionId, null);
});

test("the Open in World App link names the account, and only that", async () => {
  const res = await linkToken(post("/api/auth/link-token", {}, sessionCookie(ALICE)));
  const { url } = await res.json();
  const token = decodeURIComponent(new URL(url).searchParams.get("path")!).split("link=")[1];
  const found = await (await sessionFor(get(`/api/auth/world-session?link=${encodeURIComponent(token)}`))).json();
  assert.equal(found.sessionId, "session_alice");
  const forged = await sessionFor(get(`/api/auth/world-session?link=${encodeURIComponent(token.slice(0, -2) + "xx")}`));
  assert.equal(forged.status, 400);
  const noSession = await linkToken(post("/api/auth/link-token", {}, sessionCookie(BOB)));
  assert.equal(noSession.status, 409, "no link for an account with no session to prove");
});

test("two codes started in one browser each keep their own claim", async () => {
  const a = await pairStart();
  const b = await pairStart();
  const codeA = (await a.json()).code;
  const codeB = (await b.json()).code;
  // Both claims survive in the same browser: approving the one on screen works.
  const jar = `lifeline_pair_${codeA}=${cookieOf(a, `lifeline_pair_${codeA}`)}; lifeline_pair_${codeB}=${cookieOf(b, `lifeline_pair_${codeB}`)}`;
  assert.equal((await pairApprove(post("/api/auth/pair/approve", { code: codeA }, sessionCookie(ALICE)))).status, 200);
  const done = await pairPoll(get(`/api/auth/pair?code=${codeA}`, jar));
  assert.equal((await done.json()).nullifierHash, ALICE);
});

test("a browser is paired from World App, once, and only by the browser that asked", async () => {
  const started = await pairStart();
  const { code } = await started.json();
  const claim = `lifeline_pair_${code}=${cookieOf(started, `lifeline_pair_${code}`)}`;
  const poll = (c: string) => pairPoll(get(`/api/auth/pair?code=${code}`, c));

  assert.equal((await (await poll(claim)).json()).status, "pending");
  assert.equal((await pairApprove(post("/api/auth/pair/approve", { code }))).status, 401, "approving needs a signed-in human");
  assert.equal((await pairApprove(post("/api/auth/pair/approve", { code }, sessionCookie(ALICE)))).status, 200);
  assert.equal((await pairApprove(post("/api/auth/pair/approve", { code }, sessionCookie(BOB)))).status, 400, "a code is approved once");

  assert.equal((await (await poll(`lifeline_pair_${code}=not-the-claim`)).json()).status, "expired", "the code alone is not enough");
  const done = await poll(claim);
  assert.equal((await done.json()).nullifierHash, ALICE);
  assert.ok(cookieOf(done, "lifeline_session"));
  assert.equal((await (await poll(claim)).json()).status, "expired", "collected once");
});
