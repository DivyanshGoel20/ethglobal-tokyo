process.env.LIFELINE_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { useSandbox } from "./sandbox";
import { attachSession } from "../src/lib/session";
import { mintAgentToken, resolveSpender, resolveAgentReader, verifyAgentToken } from "../src/lib/agentToken";
import { addAgentToStore, removeAgentFromStore } from "../src/lib/agentStore";
import { resourceUrlProblem } from "../src/lib/resourceUrl";
import { POST as connect } from "../src/app/api/agent/connect/route";
import { GET as poll, POST as answer } from "../src/app/api/agent/connect/[code]/route";
import { GET as me } from "../src/app/api/agent/me/route";

/** An agent asking its human for a line, and the mandate that comes back bound to it. */

useSandbox();
const HUMAN = "0x" + "c1".repeat(32);
const OTHER_HUMAN = "0x" + "c2".repeat(32);
const A = "0x" + "a1".repeat(20);
const B = "0x" + "b2".repeat(20);
const agent = (address: string, humanOwner = HUMAN) =>
  addAgentToStore({
    address,
    name: address.slice(0, 6),
    humanOwner,
    rail: "arc",
    creditLimit: 1,
    outstandingDebt: 0,
    totalBorrowed: 0,
    totalRepaid: 0,
    currentBalance: 0,
    status: "Healthy",
    registeredAt: Date.now(),
  } as any);
agent(A);
agent(B);

const sessionCookie = (h: string) => `lifeline_session=${attachSession(NextResponse.json({}), h).cookies.get("lifeline_session")!.value}`;
const req = (url: string, init: { method?: string; body?: unknown; bearer?: string; cookie?: string } = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      "content-type": "application/json",
      ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
  });
const params = (code: string) => ({ params: { code } });

test("a bound mandate spends through its own agent and no other", () => {
  const { token, grant } = mintAgentToken(HUMAN, { capUsd: 1, days: 1, label: "x", agentAddress: A });
  assert.equal(grant.agentAddress, A.toLowerCase());
  assert.equal(verifyAgentToken(token)?.agentAddress, A.toLowerCase());

  assert.ok("spender" in resolveSpender(req("/", { bearer: token }), A, "arc"));
  const other = resolveSpender(req("/", { bearer: token }), B, "arc");
  assert.ok("error" in other && other.error.status === 403);
  const read = resolveAgentReader(req("/", { bearer: token }), B);
  assert.ok("error" in read && read.error.status === 403);
});

test("an unbound mandate still works for any of its human's agents", () => {
  const { token } = mintAgentToken(HUMAN, { capUsd: 1, days: 1, label: "x" });
  assert.ok("spender" in resolveSpender(req("/", { bearer: token }), A, "arc"));
  assert.ok("spender" in resolveSpender(req("/", { bearer: token }), B, "arc"));
});

test("revoking the agent ends its bound mandate", async () => {
  const C = "0x" + "c3".repeat(20);
  agent(C);
  const { token } = mintAgentToken(HUMAN, { capUsd: 1, days: 1, label: "x", agentAddress: C });
  assert.equal((await me(req("/api/agent/me", { bearer: token }))).status, 200);
  removeAgentFromStore(C);
  assert.equal((await me(req("/api/agent/me", { bearer: token }))).status, 410);
  const spend = resolveSpender(req("/", { bearer: token }), C, "arc");
  assert.ok("error" in spend && spend.error.status === 404);
});

test("connect: the agent gets a link and a secret; nothing is issued until the human says yes", async () => {
  const started = await (await connect(req("/api/agent/connect", { method: "POST", body: { name: "claude", rail: "sui", capUsd: 0.25, reason: "buy data" } }))).json();
  assert.match(started.approveUrl, /\/connect\/[A-Z0-9]{8}$/);
  const code = started.approveUrl.split("/").pop();

  // The agent polls: pending, no token.
  const pending = await (await poll(req(`/api/agent/connect/${code}`, { bearer: started.secret }), params(code))).json();
  assert.equal(pending.status, "pending");
  assert.equal(pending.token, undefined);

  // A wrong secret learns nothing; nobody signed in cannot read or answer it.
  assert.equal((await poll(req(`/api/agent/connect/${code}`, { bearer: "guess" }), params(code))).status, 404);
  assert.equal((await poll(req(`/api/agent/connect/${code}`), params(code))).status, 401);
  assert.equal((await answer(req(`/api/agent/connect/${code}`, { method: "POST", body: { action: "approve" } }), params(code))).status, 401);

  // The human sees it and approves.
  const cookie = sessionCookie(HUMAN);
  const seen = await (await poll(req(`/api/agent/connect/${code}`, { cookie }), params(code))).json();
  assert.equal(seen.name, "claude");
  assert.equal(seen.reason, "buy data");
  const ok = await answer(req(`/api/agent/connect/${code}`, { method: "POST", cookie, body: { action: "approve", capUsd: 0.25, days: 1 } }), params(code));
  const okBody = await ok.json();
  assert.equal(ok.status, 200, okBody.error);
  assert.equal(okBody.agent.rail, "sui");

  // Another account cannot read it now, and a second yes mints nothing.
  assert.equal((await poll(req(`/api/agent/connect/${code}`, { cookie: sessionCookie(OTHER_HUMAN) }), params(code))).status, 409);
  assert.equal((await answer(req(`/api/agent/connect/${code}`, { method: "POST", cookie, body: { action: "approve" } }), params(code))).status, 409);

  // The agent collects its bound mandate, once.
  const got = await (await poll(req(`/api/agent/connect/${code}`, { bearer: started.secret }), params(code))).json();
  assert.equal(got.status, "approved");
  assert.equal(verifyAgentToken(got.token)?.agentAddress, okBody.agent.address.toLowerCase());
  assert.equal(verifyAgentToken(got.token)?.human, HUMAN);
  const again = await (await poll(req(`/api/agent/connect/${code}`, { bearer: started.secret }), params(code))).json();
  assert.equal(again.status, "collected");
  assert.equal(again.token, undefined);
});

test("connect: a declined request issues nothing", async () => {
  const started = await (await connect(req("/api/agent/connect", { method: "POST", body: {} }))).json();
  const code = started.approveUrl.split("/").pop();
  const cookie = sessionCookie(HUMAN);
  assert.equal((await answer(req(`/api/agent/connect/${code}`, { method: "POST", cookie, body: { action: "deny" } }), params(code))).status, 200);
  const r = await (await poll(req(`/api/agent/connect/${code}`, { bearer: started.secret }), params(code))).json();
  assert.equal(r.status, "denied");
  assert.equal(r.token, undefined);
});

test("Lifeline fetches public URLs and its own sellers, not the private network", () => {
  assert.equal(resourceUrlProblem("https://seller.example/data"), null);
  assert.equal(resourceUrlProblem("http://localhost:4402/premium-data"), null); // its own seller
  assert.equal(resourceUrlProblem("http://localhost:3000/api/paid/signal", "http://localhost:3000"), null);
  for (const bad of [
    "http://169.254.169.254/latest/meta-data",
    "http://127.0.0.1:8545",
    "http://localhost:6379",
    "http://10.0.0.5/admin",
    "http://192.168.1.1",
    "http://[::1]:3000",
    "file:///etc/passwd",
    "https://user:pw@seller.example/",
    "not a url",
  ]) {
    assert.ok(resourceUrlProblem(bad), bad);
  }
});
