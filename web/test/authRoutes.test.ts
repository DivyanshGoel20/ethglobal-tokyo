// Pinned so the test can mint a genuine session the way the verify route does.
process.env.LIFELINE_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";

import { attachSession } from "../src/lib/session";
import { useSandbox } from "./sandbox";
import { GET as sessionGET, DELETE as sessionDELETE } from "../src/app/api/auth/session/route";
import { GET as reputationGET } from "../src/app/api/reputation/route";
import { GET as rpContextGET } from "../src/app/api/auth/world-rp-context/route";

const HUMAN = "0x1a4d7ff9847b6b4d616afa1e16ada2c29cf59e4357ce759a87320b539a1b8077";
useSandbox();

function signedCookie(nullifier: string): string {
  const token = attachSession(NextResponse.json({}), nullifier).cookies.get("lifeline_session")?.value;
  assert.ok(token);
  return `lifeline_session=${token}`;
}

const req = (url: string, cookie?: string) =>
  new NextRequest(url, { headers: cookie ? { cookie } : {} });

test("the session route answers with the human the signed cookie proves", async () => {
  const res = await sessionGET(req("http://lifeline.test/api/auth/session", signedCookie(HUMAN)));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.nullifierHash, HUMAN);
});

test("a bare world_session cookie is not a session", async () => {
  // The old verify route set the nullifier in plain text; anyone could type one.
  const res = await sessionGET(req("http://lifeline.test/api/auth/session", `world_session=${HUMAN}`));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).authenticated, false);
});

test("signing out voids the cookie", async () => {
  const header = (await sessionDELETE()).headers.get("set-cookie") || "";
  assert.match(header, /lifeline_session=;/);
  assert.match(header, /Max-Age=0/i);
});

test("reputation cannot be read by naming a nullifier in the query", async () => {
  const res = await reputationGET(req(`http://lifeline.test/api/reputation?humanOwner=${HUMAN}`));
  assert.equal(res.status, 401);
});

test("reputation is readable by the human it belongs to", async () => {
  const res = await reputationGET(req("http://lifeline.test/api/reputation", signedCookie(HUMAN)));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).success, true);
});

test("the RP context refuses to sign without a configured key", async () => {
  const saved = { a: process.env.WORLD_RP_SIGNING_KEY, b: process.env.WORLD_API_KEY };
  delete process.env.WORLD_RP_SIGNING_KEY;
  delete process.env.WORLD_API_KEY;
  try {
    const res = await rpContextGET();
    assert.equal(res.status, 500);
  } finally {
    if (saved.a !== undefined) process.env.WORLD_RP_SIGNING_KEY = saved.a;
    if (saved.b !== undefined) process.env.WORLD_API_KEY = saved.b;
  }
});
