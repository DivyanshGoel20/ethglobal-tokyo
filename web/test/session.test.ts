// A pinned secret, so the test can forge tokens the way an attacker would.
process.env.FLOAT_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { attachSession, getHuman, requireOwnedAgent } from "../src/lib/session";
import { getAllAgents, saveAllAgents } from "../src/lib/agentStore";
import { useSandbox } from "./sandbox";

const SECRET = process.env.FLOAT_SESSION_SECRET!;
const HUMAN = "0x1a4d7ff9847b6b4d616afa1e16ada2c29cf59e4357ce759a87320b539a1b8077";
const OTHER_HUMAN = "0x" + "ab".repeat(32);

// One agent per human, so ownership has something to be checked against.
useSandbox();
saveAllAgents(
  [HUMAN, OTHER_HUMAN].map((humanOwner, i) => ({
    agentId: `agent_fixture_${i}`,
    address: `0x${String(i + 1).repeat(40)}`,
    name: `fixture ${i}`,
    humanOwner,
    creditLimit: 10,
    outstandingDebt: 0,
    totalBorrowed: 0,
    totalRepaid: 0,
    currentBalance: 0,
    status: "Healthy" as const,
    registeredAt: Date.now(),
  }))
);

const sign = (payload: string) =>
  crypto.createHmac("sha256", Buffer.from(SECRET, "utf8")).update(payload).digest("base64url");

/** Mints a token directly, so expiry and tampering are reachable from a test. */
function forge(claims: object, mac?: string) {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${mac ?? sign(payload)}`;
}

const withCookie = (token?: string) =>
  new NextRequest("http://float.test/api/pay", {
    headers: token ? { cookie: `float_session=${token}` } : {},
  });

function issued(nullifier: string): string {
  const res = attachSession(NextResponse.json({}), nullifier);
  const token = res.cookies.get("float_session")?.value;
  assert.ok(token, "attachSession set no cookie");
  return token;
}

test("a session issued after World verification identifies that human", () => {
  assert.equal(getHuman(withCookie(issued(HUMAN))), HUMAN);
});

test("the cookie is httpOnly, so page scripts cannot read or replay it", () => {
  const header = attachSession(NextResponse.json({}), HUMAN).headers.get("set-cookie") || "";
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=lax/i);
});

test("no cookie is no human", () => {
  assert.equal(getHuman(withCookie()), null);
});

test("swapping in another nullifier is rejected", () => {
  // The whole point: the payload is readable, so it must not be trusted.
  const other = "0x" + "ff".repeat(32);
  const token = issued(HUMAN);
  const forgedPayload = Buffer.from(JSON.stringify({ n: other, exp: 2e9 }), "utf8").toString("base64url");
  const tampered = `${forgedPayload}.${token.split(".")[1]}`;

  assert.equal(getHuman(withCookie(tampered)), null);
});

test("a guessed signature is rejected", () => {
  assert.equal(getHuman(withCookie(forge({ n: HUMAN, exp: 2e9 }, "not-a-real-mac"))), null);
});

test("an expired session is rejected even though it is correctly signed", () => {
  const expired = forge({ n: HUMAN, exp: Math.floor(Date.now() / 1000) - 1 });
  assert.equal(getHuman(withCookie(expired)), null, "expiry is not enforced");
  // Same claims, still in date, must pass - so the rejection above is the clock.
  assert.equal(getHuman(withCookie(forge({ n: HUMAN, exp: 2e9 }))), HUMAN);
});

test("a malformed cookie does not throw", () => {
  for (const junk of ["", ".", "a.b.c", "nodot", "%%%.%%%"]) {
    assert.equal(getHuman(withCookie(junk)), null, `accepted malformed cookie: ${junk}`);
  }
});

test("spending through someone else's agent is refused", () => {
  const agents = getAllAgents();
  const mine = agents.find((a) => (a.humanOwner || "").toLowerCase() === HUMAN.toLowerCase());
  const theirs = agents.find((a) => (a.humanOwner || "").toLowerCase() !== HUMAN.toLowerCase());
  assert.ok(mine && theirs, "fixture needs one agent per human");

  const req = withCookie(issued(HUMAN));

  const ok = requireOwnedAgent(req, mine!.address);
  assert.ok(!("error" in ok), "the owner was locked out of their own agent");

  const denied = requireOwnedAgent(req, theirs!.address);
  assert.ok("error" in denied, "an agent belonging to another human was spendable");
  assert.equal((denied as any).error.status, 403);
});

test("an unauthenticated caller cannot reach any agent", async () => {
  const agents = getAllAgents();
  const denied = requireOwnedAgent(withCookie(), agents[0].address);
  assert.ok("error" in denied);
  assert.equal((denied as any).error.status, 401);
});
