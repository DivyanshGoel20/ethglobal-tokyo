process.env.LIFELINE_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";
process.env.WORLD_AGENTS_CLIENT_ID = "lifeline-test-client";
process.env.WORLD_AGENTS_CLIENT_SECRET = "test-secret";
process.env.WORLD_AGENTS_ISSUER = "https://sandbox.auth.world.org";

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { useSandbox } from "./sandbox";
import { attachSession } from "../src/lib/session";
import { addAgentToStore } from "../src/lib/agentStore";
import { createHold } from "../src/lib/holdStore";
import { useKeys, startApproval, pollApproval, bindIdentity, boundIdentity, claimCompletion, ORB_ACR } from "../src/lib/worldAgents";
import { POST as answerHold } from "../src/app/api/pay/holds/[holdId]/route";
import { POST as requestApproval } from "../src/app/api/pay/holds/[holdId]/approval/route";
import { POST as startLink } from "../src/app/api/auth/world-agents/link/route";

/**
 * World ID for Agents, everything Lifeline decides around World's IdP.
 *
 * World's endpoints are stood in for, but the ID tokens are real RS256 JWTs
 * signed by a key generated here and checked by the same validation the app
 * uses. The live flow needs the sandbox World ID app and is run by hand.
 */

useSandbox();
const ISS = "https://sandbox.auth.world.org";
const ALICE = "0x" + "a1".repeat(32);
const AGENT = ("0x" + "22".repeat(20)) as `0x${string}`;
addAgentToStore({ address: AGENT, name: "scout", humanOwner: ALICE, creditLimit: 10, outstandingDebt: 0, totalBorrowed: 0, totalRepaid: 0, currentBalance: 0 } as any);

let clock = Date.now();
Date.now = () => clock;

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
before(async () => {
  keys = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256" };
  useKeys(createLocalJWKSet({ keys: [jwk] }));
});

const idToken = (claims: Record<string, unknown> = {}) =>
  new SignJWT({ acr: ORB_ACR, amr: ["pop"], auth_time: Math.floor(clock / 1000), ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(ISS)
    .setAudience("lifeline-test-client")
    .setSubject((claims.sub as string) ?? "pairwise-alice")
    .setIssuedAt(Math.floor(clock / 1000))
    .setExpirationTime(Math.floor(clock / 1000) + 300)
    .sign(keys.privateKey);

// What World's token endpoint answers next.
let tokenAnswer: () => Promise<{ status: number; body: object }>;
let calls: string[];
beforeEach(() => {
  calls = [];
  tokenAnswer = async () => ({ status: 400, body: { error: "authorization_pending" } });
  globalThis.fetch = (async (url: string, init?: any) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("/.well-known/openid-configuration")) {
      return Response.json({ issuer: ISS, token_endpoint: `${ISS}/api/v1/token`, device_authorization_endpoint: `${ISS}/api/v1/device_authorization`, jwks_uri: `${ISS}/.well-known/jwks.json` });
    }
    if (u.endsWith("/device_authorization")) {
      assert.match(init.headers.Authorization, /^Basic /, "the client authenticates");
      return Response.json({ device_code: "secret-device-code", user_code: "WDJB-MJHT", verification_uri: `${ISS}/device`, verification_uri_complete: `${ISS}/device?user_code=WDJB-MJHT`, expires_in: 1200, interval: 5 });
    }
    if (u.endsWith("/token")) {
      const a = await tokenAnswer();
      return new Response(JSON.stringify(a.body), { status: a.status });
    }
    throw new Error(`unexpected ${u}`);
  }) as typeof fetch;
});

const tick = (s = 6) => (clock += s * 1000);
let n = 0;
const attempt = async (id = `t${++n}`, purpose: any = { kind: "release-hold", holdId: id }) => {
  const a = await startApproval(id, ALICE, purpose);
  tick();
  return a;
};

test("linking binds the pairwise subject to the signed-in human, once", async () => {
  await attempt("link:alice", { kind: "link" });
  const token = await idToken();
  tokenAnswer = async () => ({ status: 200, body: { id_token: token, access_token: "x", token_type: "Bearer", expires_in: 300 } });
  const a = await pollApproval("link:alice");
  assert.equal(a?.status, "approved");
  assert.equal(boundIdentity(ALICE)?.sub, "pairwise-alice");
  assert.deepEqual(bindIdentity(ALICE, { iss: ISS, sub: "someone-else", authTime: 0, acr: ORB_ACR }), {
    ok: false,
    reason: "This account is already linked to a different World ID.",
  });
});

test("the device code never leaves the server", async () => {
  const a = await startApproval("peek", ALICE, { kind: "release-hold", holdId: "peek" });
  const { publicView } = await import("../src/lib/worldAgents");
  assert.equal(JSON.stringify(publicView(a)).includes("secret-device-code"), false);
});

test("waiting, then approved by the linked World ID", async () => {
  await attempt("h-ok");
  assert.equal((await pollApproval("h-ok"))?.status, "pending", "authorization_pending keeps waiting");
  tick();
  const token = await idToken();
  tokenAnswer = async () => ({ status: 200, body: { id_token: token } });
  assert.equal((await pollApproval("h-ok"))?.status, "approved");
  assert.equal(claimCompletion("h-ok"), true);
  assert.equal(claimCompletion("h-ok"), false, "the protected action runs once");
});

test("polls no faster than World asked, and slow_down backs off", async () => {
  await startApproval("h-pace", ALICE, { kind: "release-hold", holdId: "h-pace" });
  const before = calls.filter((c) => c.endsWith("/token")).length;
  await pollApproval("h-pace");
  assert.equal(calls.filter((c) => c.endsWith("/token")).length, before, "too early: not polled");
  tick();
  tokenAnswer = async () => ({ status: 400, body: { error: "slow_down" } });
  const a = await pollApproval("h-pace");
  assert.equal(a?.interval, 10);
});

test("declined in World ID", async () => {
  await attempt("h-no");
  tokenAnswer = async () => ({ status: 400, body: { error: "access_denied" } });
  const a = await pollApproval("h-no");
  assert.equal(a?.status, "denied");
  assert.equal(claimCompletion("h-no"), false);
});

test("expired before anyone answered", async () => {
  await attempt("h-exp");
  tokenAnswer = async () => ({ status: 400, body: { error: "expired_token" } });
  assert.equal((await pollApproval("h-exp"))?.status, "expired");
});

test("approved by a different World ID: refused", async () => {
  await attempt("h-who");
  const token = await idToken({ sub: "pairwise-mallory" });
  tokenAnswer = async () => ({ status: 200, body: { id_token: token } });
  const a = await pollApproval("h-who");
  assert.equal(a?.status, "mismatch");
  assert.equal(claimCompletion("h-who"), false);
});

test("a confirmation from before the request is not fresh", async () => {
  await attempt("h-old");
  const token = await idToken({ auth_time: Math.floor(clock / 1000) - 3600 });
  tokenAnswer = async () => ({ status: 200, body: { id_token: token } });
  const a = await pollApproval("h-old");
  assert.equal(a?.status, "failed");
  assert.match(a!.reason!, /older than this request/);
});

test("a token for another app, signed by another key, or of another class is not believed", async () => {
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT({ acr: ORB_ACR, auth_time: Math.floor(clock / 1000) })
    .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(ISS).setAudience("lifeline-test-client").setSubject("pairwise-alice")
    .setIssuedAt().setExpirationTime("5m").sign(other.privateKey);
  const wrongAud = await new SignJWT({ acr: ORB_ACR, auth_time: Math.floor(clock / 1000) })
    .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(ISS).setAudience("someone-else").setSubject("pairwise-alice")
    .setIssuedAt(Math.floor(clock / 1000)).setExpirationTime(Math.floor(clock / 1000) + 300).sign(keys.privateKey);
  const weak = await idToken({ acr: "https://example.com/weak" });
  for (const [label, token] of [["forged", forged], ["audience", wrongAud], ["class", weak]] as const) {
    await attempt(`h-${label}`);
    tokenAnswer = async () => ({ status: 200, body: { id_token: token } });
    assert.equal((await pollApproval(`h-${label}`))?.status, "failed", label);
  }
});

/* ---- the routes -------------------------------------------------------- */

const cookie = (h: string) => `lifeline_session=${attachSession(NextResponse.json({}), h).cookies.get("lifeline_session")!.value}`;
const req = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

test("a click can no longer release a held payment; declining still can", async () => {
  const hold = createHold({ human: ALICE, agentAddress: AGENT, url: "http://x/dossier", method: "GET", payTo: "0x1", amountUsd: 5, verdict: {} as any });
  const approve = await answerHold(req(`/api/pay/holds/${hold.holdId}`, { action: "approve" }, { cookie: cookie(ALICE) }), { params: { holdId: hold.holdId } });
  assert.equal(approve.status, 403);
  assert.equal((await approve.json()).code, "world_id_required");
  const decline = await answerHold(req(`/api/pay/holds/${hold.holdId}`, { action: "decline" }, { cookie: cookie(ALICE) }), { params: { holdId: hold.holdId } });
  assert.equal(decline.status, 200);
});

test("the agent's owner can ask for approval; a stranger cannot", async () => {
  const hold = createHold({ human: ALICE, agentAddress: AGENT, url: "http://x/dossier", method: "GET", payTo: "0x1", amountUsd: 5, verdict: {} as any });
  const stranger = await requestApproval(req(`/api/pay/holds/${hold.holdId}/approval`, {}, { cookie: cookie("0x" + "b2".repeat(32)) }), { params: { holdId: hold.holdId } });
  assert.notEqual(stranger.status, 200);
  const owner = await requestApproval(req(`/api/pay/holds/${hold.holdId}/approval`, {}, { cookie: cookie(ALICE) }), { params: { holdId: hold.holdId } });
  const body = await owner.json();
  assert.equal(owner.status, 200);
  assert.equal(body.userCode, "WDJB-MJHT");
  assert.equal(JSON.stringify(body).includes("secret-device-code"), false);
});

test("only a signed-in human can link World ID for Agents", async () => {
  assert.equal((await startLink(req("/api/auth/world-agents/link", {}))).status, 401);
});
