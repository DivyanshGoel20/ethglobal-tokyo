process.env.FLOAT_SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { useSandbox } from "./sandbox";
import { attachSession } from "../src/lib/session";
import { humanForSession, linkSession, spendSessionNullifier } from "../src/lib/worldSessions";
import { POST as sessionPOST } from "../src/app/api/auth/world-session/route";
import { GET as rpContextGET } from "../src/app/api/auth/world-rp-context/route";

useSandbox();
const A = "0x" + "aa".repeat(32);
const B = "0x" + "bb".repeat(32);

test("a session identifies nobody until sign-up links it", () => {
  assert.equal(humanForSession("session_1"), null);
  assert.deepEqual(linkSession("session_1", A), { ok: true });
  assert.equal(humanForSession("session_1"), A);
});

test("a linked session cannot be moved to someone else", () => {
  const moved = linkSession("session_1", B);
  assert.equal(moved.ok, false);
  assert.equal(humanForSession("session_1"), A);
});

test("a session proof can be used once", () => {
  assert.equal(spendSessionNullifier("0xABC"), true);
  assert.equal(spendSessionNullifier("0xabc"), false);
});

const post = (body: unknown, cookie?: string) =>
  sessionPOST(
    new NextRequest("http://float.test/api/auth/world-session", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    })
  );

test("something that is not a session proof is refused before World is asked", async () => {
  const res = await post({ mode: "prove", result: { nullifier: "0x1" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "malformed_session");
});

test("session requests are signed without an action", async () => {
  process.env.WORLD_RP_SIGNING_KEY = "0x" + "11".repeat(32);
  const withAction = await (await rpContextGET(new Request("http://float.test/api/auth/world-rp-context"))).json();
  const session = await (await rpContextGET(new Request("http://float.test/api/auth/world-rp-context?kind=session"))).json();
  assert.ok(withAction.signature && session.signature);
  assert.notEqual(withAction.signature, session.signature);
});

// Keeps the cookie helper in use for anyone extending the create-path tests.
void attachSession(NextResponse.json({}), A);
